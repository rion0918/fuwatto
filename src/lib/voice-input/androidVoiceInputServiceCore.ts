import type {
  VoiceInputAvailability,
  VoiceInputError,
  VoiceInputEvent,
  VoiceInputPermissionResponse,
  VoiceInputService,
} from './voiceInputTypes';

export type AndroidVoiceInputProvider = VoiceInputService & {
  prepareOfflineModel?(): Promise<void>;
  releaseForBackground(): void;
};

type AndroidHybridVoiceInputServiceOptions = {
  primary: AndroidVoiceInputProvider;
  fallback: AndroidVoiceInputProvider;
  providerOverride?: () => 'primary' | 'fallback' | null;
};

type SessionState = 'idle' | 'starting' | 'listening' | 'stopping';

function isPermissionState(availability: VoiceInputAvailability) {
  return (
    availability.status === 'permission-required' || availability.status === 'permission-denied'
  );
}

function isPrimaryProviderFailure(error: VoiceInputError) {
  return error !== 'no-speech' && error !== 'aborted' && error !== 'not-allowed';
}

function isActiveState(state: SessionState) {
  return state !== 'idle';
}

export function createAndroidHybridVoiceInputService(
  options: AndroidHybridVoiceInputServiceOptions,
): AndroidVoiceInputProvider & { prepareOfflineModel(): Promise<void> } {
  const listeners = new Set<(event: VoiceInputEvent) => void>();
  const { primary, fallback, providerOverride } = options;
  let activeProvider: AndroidVoiceInputProvider | null = null;
  let activeProviderSubscription: { remove(): void } | null = null;
  let state: SessionState = 'idle';
  let primaryFailed = false;
  let sessionSequence = 0;
  let activeSessionId: number | null = null;
  let pendingFallbackSessionId: number | null = null;

  function emit(event: VoiceInputEvent) {
    for (const listener of listeners) listener(event);
  }

  function removeActiveProviderSubscription() {
    activeProviderSubscription?.remove();
    activeProviderSubscription = null;
  }

  function finishSession(sessionId: number) {
    if (activeSessionId !== sessionId) return;
    removeActiveProviderSubscription();
    activeProvider = null;
    activeSessionId = null;
    if (pendingFallbackSessionId === sessionId) pendingFallbackSessionId = null;
    state = 'idle';
  }

  async function startProvider(provider: AndroidVoiceInputProvider, sessionId: number) {
    activeProvider = provider;
    state = 'starting';
    activeProviderSubscription = provider.subscribe((event) =>
      forwardProviderEvent(event, sessionId),
    );
    await provider.start();
    if (activeSessionId !== sessionId) {
      provider.abort();
    }
  }

  async function tryImmediateFallback(
    sessionId: number,
    originalError: Extract<VoiceInputEvent, { type: 'error' }>,
  ) {
    pendingFallbackSessionId = sessionId;
    removeActiveProviderSubscription();
    activeProvider = null;

    try {
      const fallbackAvailability = await fallback.getAvailability();
      if (activeSessionId !== sessionId) return;

      if (fallbackAvailability.status === 'ready') {
        await startProvider(fallback, sessionId);
        if (pendingFallbackSessionId === sessionId) pendingFallbackSessionId = null;
        return;
      }
    } catch {
      // Fall through and surface the original provider failure if fallback cannot start.
    }

    if (activeSessionId !== sessionId) return;
    finishSession(sessionId);
    emit(originalError);
    emit({ type: 'end' });
  }

  function forwardProviderEvent(event: VoiceInputEvent, sessionId: number) {
    if (activeSessionId !== sessionId) return;

    // Android uses the final result only. This also protects the UI if a native
    // recognizer emits an interim result despite interimResults being disabled.
    if (event.type === 'result' && !event.isFinal) return;

    if (event.type === 'start') state = 'listening';
    if (event.type === 'error') {
      const isPrimaryRuntimeFailure =
        activeProvider === primary && isPrimaryProviderFailure(event.error);
      if (isPrimaryRuntimeFailure) primaryFailed = true;
      if (isPrimaryRuntimeFailure && state === 'starting' && providerOverride?.() !== 'primary') {
        void tryImmediateFallback(sessionId, event);
        return;
      }
      finishSession(sessionId);
      emit(event);
      emit({ type: 'end' });
      return;
    }
    if (event.type === 'end') {
      finishSession(sessionId);
    }

    emit(event);
  }

  async function resolveProvider() {
    const forcedProvider = providerOverride?.();
    if (forcedProvider === 'fallback') {
      const fallbackAvailability = await fallback.getAvailability();
      if (fallbackAvailability.status === 'ready') {
        return { provider: fallback, availability: fallbackAvailability };
      }
      return { provider: null, availability: fallbackAvailability };
    }

    let primaryAvailability: VoiceInputAvailability;
    if (primaryFailed && forcedProvider !== 'primary') {
      primaryAvailability = { status: 'unsupported', canAskAgain: false };
    } else {
      try {
        primaryAvailability = await primary.getAvailability();
      } catch {
        primaryFailed = true;
        primaryAvailability = { status: 'unsupported', canAskAgain: false };
      }
    }
    if (primaryAvailability.status === 'ready') {
      return { provider: primary, availability: primaryAvailability };
    }

    if (isPermissionState(primaryAvailability)) {
      const fallbackAvailability = await fallback.getAvailability();
      if (fallbackAvailability.status === 'ready') {
        return { provider: fallback, availability: fallbackAvailability };
      }
      if (isPermissionState(fallbackAvailability)) {
        return { provider: null, availability: fallbackAvailability };
      }
      return { provider: null, availability: primaryAvailability };
    }

    const fallbackAvailability = await fallback.getAvailability();
    if (fallbackAvailability.status === 'ready') {
      return { provider: fallback, availability: fallbackAvailability };
    }

    if (isPermissionState(fallbackAvailability)) {
      return { provider: null, availability: fallbackAvailability };
    }

    if (
      primaryAvailability.status === 'model-unavailable' ||
      fallbackAvailability.status === 'model-unavailable'
    ) {
      return { provider: null, availability: fallbackAvailability };
    }

    return { provider: null, availability: primaryAvailability };
  }

  const service: AndroidVoiceInputProvider & { prepareOfflineModel(): Promise<void> } = {
    async getAvailability() {
      return (await resolveProvider()).availability;
    },

    async requestMicrophonePermission(): Promise<VoiceInputPermissionResponse> {
      const forcedProvider = providerOverride?.();
      if (forcedProvider === 'fallback') return fallback.requestMicrophonePermission();
      if (forcedProvider === 'primary') return primary.requestMicrophonePermission();
      if (primaryFailed) return fallback.requestMicrophonePermission();

      return primary
        .getAvailability()
        .then((availability) => {
          if (
            availability.status === 'unsupported' ||
            availability.status === 'model-unavailable'
          ) {
            return fallback.requestMicrophonePermission();
          }
          return primary.requestMicrophonePermission();
        })
        .catch(() => {
          primaryFailed = true;
          return fallback.requestMicrophonePermission();
        });
    },

    async prepareOfflineModel() {
      await primary.prepareOfflineModel?.();
    },

    async start() {
      if (isActiveState(state)) throw new Error('Voice recognizer is already active');

      const resolved = await resolveProvider();
      if (!resolved.provider || resolved.availability.status !== 'ready') {
        throw new Error(`Voice input is unavailable: ${resolved.availability.status}`);
      }

      const sessionId = ++sessionSequence;
      activeSessionId = sessionId;

      try {
        await startProvider(resolved.provider, sessionId);
      } catch (error) {
        if (pendingFallbackSessionId === sessionId) return;
        removeActiveProviderSubscription();
        activeProvider = null;
        if (resolved.provider === primary) {
          primaryFailed = true;
          if (providerOverride?.() !== 'primary' && activeSessionId === sessionId) {
            try {
              const fallbackAvailability = await fallback.getAvailability();
              if (activeSessionId !== sessionId) return;
              if (fallbackAvailability.status === 'ready') {
                await startProvider(fallback, sessionId);
                return;
              }
            } catch {
              // Fall through and surface the primary start failure when fallback fails too.
            }
          }
        }
        if (activeSessionId !== sessionId) return;
        finishSession(sessionId);
        throw error;
      }
    },

    stop() {
      if (!activeProvider || state === 'idle' || state === 'stopping') return;
      state = 'stopping';
      activeProvider.stop();
    },

    abort() {
      if (state === 'idle') return;
      const provider = activeProvider;
      const currentSessionId = activeSessionId;
      if (currentSessionId !== null) {
        finishSession(currentSessionId);
      } else {
        removeActiveProviderSubscription();
        activeProvider = null;
        pendingFallbackSessionId = null;
        state = 'idle';
      }
      provider?.abort();
      emit({ type: 'error', error: 'aborted', message: 'Voice input was cancelled' });
      emit({ type: 'end' });
    },

    subscribe(listener) {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },

    releaseForBackground() {
      if (state !== 'idle') service.abort();
      primary.releaseForBackground();
      fallback.releaseForBackground();
    },
  };

  return service;
}
