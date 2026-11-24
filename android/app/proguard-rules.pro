# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:

# App Widget & react-native-android-widget entry points
-keep class com.rion0918.popreminder.widget.PopReminderWidget { *; }
-keep class com.reactnativeandroidwidget.RNWidgetProvider { *; }
-keep class com.reactnativeandroidwidget.RNWidgetBackgroundTaskWorker { *; }
-keep class com.reactnativeandroidwidget.RNWidgetCollectionService { *; }
-keep class com.reactnativeandroidwidget.RNWidgetImageProvider { *; }
-keep class com.reactnativeandroidwidget.RNWidgetConfigurationActivity { *; }
-keep class com.reactnativeandroidwidget.AndroidWidgetModule { *; }
-keep class com.reactnativeandroidwidget.AndroidWidgetPackage { *; }
-keep class com.reactnativeandroidwidget.oss.HeadlessJsTaskWorker {
    public <init>(android.content.Context, androidx.work.WorkerParameters);
}
