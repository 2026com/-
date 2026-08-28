package com.growth.xiaomei;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 本地自定义插件：AppBridge
 * 提供应用级原生能力，当前：屏幕方向切换（横屏/竖屏/跟随系统）。
 * 由 MainActivity.onCreate 中 registerPlugin 注册，无需额外依赖。
 * 说明：MainActivity 的 configChanges 已包含 orientation|screenSize|smallestScreenSize|screenLayout，
 * 旋转不会重建 Activity，WebView 状态（React 树）完整保留。
 */
@CapacitorPlugin(name = "AppBridge")
public class AppBridgePlugin extends Plugin {

    @PluginMethod
    public void setOrientation(PluginCall call) {
        String type = call.getString("type", "auto");
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("activity unavailable");
            return;
        }
        final int orientation;
        if ("landscape".equals(type)) {
            orientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE;
        } else if ("portrait".equals(type)) {
            orientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT;
        } else {
            orientation = ActivityInfo.SCREEN_ORIENTATION_FULL_USER;
        }
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.setRequestedOrientation(orientation);
            }
        });
        JSObject ret = new JSObject();
        ret.put("type", type);
        call.resolve(ret);
    }

    /** 是否已在电池优化白名单中 */
    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) { call.reject("activity unavailable"); return; }
        PowerManager pm = (PowerManager) activity.getSystemService(Context.POWER_SERVICE);
        boolean ignored = pm != null && pm.isIgnoringBatteryOptimizations(activity.getPackageName());
        JSObject ret = new JSObject();
        ret.put("ignored", ignored);
        call.resolve(ret);
    }

    /** 请求加入电池优化白名单：拉起系统确认弹窗，用户点「允许」即全品牌生效 */
    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) { call.reject("activity unavailable"); return; }
        String pkg = activity.getPackageName();
        PowerManager pm = (PowerManager) activity.getSystemService(Context.POWER_SERVICE);
        JSObject ret = new JSObject();
        if (pm != null && pm.isIgnoringBatteryOptimizations(pkg)) {
            ret.put("status", "already");
            call.resolve(ret);
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + pkg));
            activity.startActivity(intent);
            ret.put("status", "launched");
        } catch (Exception e) {
            ret.put("status", "unavailable");
        }
        call.resolve(ret);
    }
}