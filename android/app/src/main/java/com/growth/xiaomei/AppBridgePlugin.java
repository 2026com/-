package com.growth.xiaomei;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSArray;
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

    // ==================== 通知调度（原生自实现，绕开 LocalNotifications 插件桥） ====================
    // 背景（K60 实测）：该 ROM 上 LocalNotifications 插件桥的通知/闹钟类调用全部挂起，
    // 而本插件桥（保活/横竖屏）正常，故通知链路改走自有代码。

    /** 调度定时通知（异步：立即返回，后台武装用户级闹钟 + 守护服务兜底）
     *  {id:number, title:string, body:string, at:number(毫秒时间戳)} */
    @PluginMethod
    public void scheduleNotification(PluginCall call) {
        Integer id = call.getInt("id");
        Double at = call.getDouble("at");
        if (id == null || id <= 0 || at == null) {
            call.reject("id 和 at 必填");
            return;
        }
        try {
            NotificationScheduler.scheduleAsync(
                    getContext(),
                    id,
                    call.getString("title", "成长提醒"),
                    call.getString("body", ""),
                    at.longValue());
            call.resolve();
        } catch (Exception e) {
            call.reject("调度失败: " + e.getMessage());
        }
    }

    /** 立即弹一条系统通知 {id:number, title, body}（不走闹钟，用于自检）
     *  返回 {delivered:boolean}：通知是否真实进入系统通知栏（是否真弹出以此为准） */
    @PluginMethod
    public void notifyNow(PluginCall call) {
        Integer id = call.getInt("id");
        if (id == null || id <= 0) { call.reject("id 必填"); return; }
        try {
            NotificationScheduler.showNotification(
                    getContext(),
                    id,
                    call.getString("title", "成长提醒"),
                    call.getString("body", ""));
            JSObject ret = new JSObject();
            ret.put("delivered", NotificationScheduler.isDelivered(getContext(), id));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("通知失败: " + e.getMessage());
        }
    }

    /** 取消已调度通知 {id:number} */
    @PluginMethod
    public void cancelNotification(PluginCall call) {
        Integer id = call.getInt("id");
        if (id == null || id <= 0) { call.reject("id 必填"); return; }
        try {
            NotificationScheduler.cancel(getContext(), id);
            call.resolve();
        } catch (Exception e) {
            call.reject("取消失败: " + e.getMessage());
        }
    }

    /** 诊断：列出系统通知渠道 + 关键权限状态 → {channels[], detail[], hasRingtone, hasFallback, exactAlarm, notificationsEnabled} */
    @PluginMethod
    public void listNotificationChannels(PluginCall call) {
        try {
            android.app.NotificationManager nm =
                    (android.app.NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            JSArray channels = new JSArray();
            JSArray detail = new JSArray();
            boolean hasNotify = false;
            if (nm != null && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                for (android.app.NotificationChannel c : nm.getNotificationChannels()) {
                    if (c == null) continue;
                    channels.put(c.getId());
                    JSObject o = new JSObject();
                    o.put("id", c.getId());
                    Uri s = c.getSound();
                    o.put("sound", s == null ? "" : s.toString());
                    o.put("importance", c.getImportance());
                    detail.put(o);
                    if (NotificationChannelsHelper.NOTIFY.equals(c.getId())) hasNotify = true;
                }
            }
            boolean exact = true;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                android.app.AlarmManager am =
                        (android.app.AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
                exact = am == null || am.canScheduleExactAlarms();
            }
            boolean enabled = androidx.core.app.NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
            JSObject ret = new JSObject();
            ret.put("channels", channels);
            ret.put("detail", detail);
            ret.put("hasNotify", hasNotify);
            ret.put("exactAlarm", exact);
            ret.put("notificationsEnabled", enabled);
            ret.put("lastAlarmResult", NotificationScheduler.getLastAlarmResult(getContext()));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("查询失败: " + e.getMessage());
        }
    }
}