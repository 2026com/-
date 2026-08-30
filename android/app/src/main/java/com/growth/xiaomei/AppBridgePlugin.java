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

    /** 立即扫描原生 pending 列表，弹出所有「已到期且未被闹钟触发过」的提醒（JS 到点兜底）。
     *  闹钟已触发过的条目已被移出 pending → 自动跳过（防双响）；
     *  闹钟被 ROM 吞掉/未设上的条目 → 立即补弹（走已实测有声的直弹路径）。 */
    @PluginMethod
    public void fireDueNow(PluginCall call) {
        try {
            boolean silent = Boolean.TRUE.equals(call.getBoolean("silent"));
            NotificationScheduler.fireIfDue(getContext(), System.currentTimeMillis(), silent);
            call.resolve();
        } catch (Exception e) {
            call.reject("扫描失败: " + e.getMessage());
        }
    }

    /** 微信式前台提示音：直接播放系统默认通知音，连响 3 次（加强提醒）。
     *  与通知系统完全解耦（不走渠道/不需要通知权限/不受闹钟管控），前台到点必响。
     *  每次用独立 Ringtone 实例（一次性），间隔 1.3s 略大于典型通知音时长。 */
    @PluginMethod
    public void playAlertSound(PluginCall call) {
        try {
            final android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
            final int TOTAL = 3;      // 连响 3 次（用户要求加长提醒）
            final long GAP_MS = 900;  // 每次间隔 0.9 秒（用户指定）
            final int[] round = {0};
            final Runnable[] seq = new Runnable[1];
            seq[0] = new Runnable() {
                @Override
                public void run() {
                    try {
                        android.net.Uri uri = android.media.RingtoneManager
                                .getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION);
                        if (uri != null) {
                            android.media.Ringtone rt =
                                    android.media.RingtoneManager.getRingtone(getContext(), uri);
                            if (rt != null) rt.play();
                        }
                    } catch (Throwable t) { /* 单次失败继续下一轮 */ }
                    round[0]++;
                    if (round[0] < TOTAL) handler.postDelayed(seq[0], GAP_MS);
                }
            };
            handler.post(seq[0]);
            call.resolve();
        } catch (Exception e) {
            call.reject("播放失败: " + e.getMessage());
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
            ret.put("guardRunning", ReminderGuardService.isRunning());
            ret.put("pendingCount", NotificationScheduler.pendingCount(getContext()));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("查询失败: " + e.getMessage());
        }
    }

    /** 提醒链路状态诊断：通知权限 / 全屏通知授权 / 电池优化白名单 / 守护服务存活 / 待触发条数 / 渠道重要级 */
    @PluginMethod
    public void getReminderStatus(PluginCall call) {
        try {
            Context ctx = getContext();
            android.app.NotificationManager nm =
                    (android.app.NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            boolean enabled = androidx.core.app.NotificationManagerCompat.from(ctx).areNotificationsEnabled();
            boolean fsi = true;   // Android 13 及以下：声明 USE_FULL_SCREEN_INTENT 即随通知权限自动授予
            if (android.os.Build.VERSION.SDK_INT >= 34 && nm != null) {
                fsi = nm.canUseFullScreenIntent();
            }
            android.os.PowerManager pm = (android.os.PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            boolean batt = pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
            int channelImportance = -1;
            if (nm != null && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                android.app.NotificationChannel c = nm.getNotificationChannel(NotificationChannelsHelper.NOTIFY);
                if (c != null) channelImportance = c.getImportance();
            }
            JSObject ret = new JSObject();
            ret.put("notificationsEnabled", enabled);
            ret.put("fsiGranted", fsi);
            ret.put("batteryIgnored", batt);
            ret.put("guardRunning", ReminderGuardService.isRunning());
            ret.put("pendingCount", NotificationScheduler.pendingCount(ctx));
            ret.put("channelImportance", channelImportance);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("查询失败: " + e.getMessage());
        }
    }

    /** 跳转本应用系统「通知设置」页（悬浮通知/锁屏通知/声音，仅需设置一次） */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) { call.reject("activity unavailable"); return; }
        try {
            final android.content.Intent i = new android.content.Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, activity.getPackageName());
            activity.runOnUiThread(new Runnable() {
                @Override public void run() {
                    try { activity.startActivity(i); } catch (Throwable t) { /* ignore */ }
                }
            });
            call.resolve();
        } catch (Exception e) {
            call.reject("跳转失败: " + e.getMessage());
        }
    }

    /** 跳转「全屏通知」授权页（Android 14+ 熄屏到点点亮屏幕弹横幅，需要用户授予；
     *  Android 13 及以下声明 USE_FULL_SCREEN_INTENT 即随通知权限自动授予 → 跳通知设置兜底） */
    @PluginMethod
    public void openFullScreenIntentSettings(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) { call.reject("activity unavailable"); return; }
        try {
            android.content.Intent i;
            if (android.os.Build.VERSION.SDK_INT >= 34) {
                i = new android.content.Intent(android.provider.Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                i.setData(android.net.Uri.fromParts("package", activity.getPackageName(), null));
            } else {
                i = new android.content.Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                i.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, activity.getPackageName());
            }
            final android.content.Intent fi = i;
            activity.runOnUiThread(new Runnable() {
                @Override public void run() {
                    try { activity.startActivity(fi); } catch (Throwable t) { /* ignore */ }
                }
            });
            call.resolve();
        } catch (Exception e) {
            call.reject("跳转失败: " + e.getMessage());
        }
    }

    /** 跳转本应用系统「应用详情」页（MIUI 在此可开 自启动 / 省电策略=无限制） */
    @PluginMethod
    public void openAppDetailsSettings(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) { call.reject("activity unavailable"); return; }
        try {
            final android.content.Intent i = new android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            i.setData(android.net.Uri.fromParts("package", activity.getPackageName(), null));
            activity.runOnUiThread(new Runnable() {
                @Override public void run() {
                    try { activity.startActivity(i); } catch (Throwable t) { /* ignore */ }
                }
            });
            call.resolve();
        } catch (Exception e) {
            call.reject("跳转失败: " + e.getMessage());
        }
    }

    /** 退出应用：返回键「2 秒内双击」由前端判定后调用（finishAffinity 结束全部任务栈） */
    @PluginMethod
    public void exitApp(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) { call.reject("activity unavailable"); return; }
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.finishAffinity();
            }
        });
        call.resolve();
    }
}