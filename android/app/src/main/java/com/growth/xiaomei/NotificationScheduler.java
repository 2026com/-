package com.growth.xiaomei;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 原生通知调度器（彻底绕开 @capacitor/local-notifications 插件桥）。
 *
 * 背景（红米 K60 实测）：该 ROM 上，经 LocalNotifications 插件桥发起的、需要 binder IPC
 * 到系统通知/闹钟服务的调用（createChannel / listChannels / schedule）全部永久挂起，
 * 只有纯本地查询（checkPermissions）幸存；而自建 AppBridge 插件桥（保活/横竖屏）一直正常。
 * 故通知链路改为：JS → AppBridge 插件 → 本类（AlarmManager 定时 + BroadcastReceiver 触发
 * + NotificationManager 直接弹出），完全自有代码、行为可控。
 *
 * 持久化：待触发闹钟存 SharedPreferences（JSON），重启后由 BootReceiver 恢复注册
 * （AlarmManager 闹钟不跨重启，与 Capacitor 插件的恢复机制等效）。
 */
public final class NotificationScheduler {
    static final String PREFS = "growth_pending_alarms";
    static final String KEY_ITEMS = "items";

    private NotificationScheduler() {}

    // ==================== 调度 / 取消 ====================

    /** 调度一条定时通知；atMs 已过期则立即弹出。 */
    public static void schedule(Context ctx, int id, String title, String body, long atMs) {
        addPending(ctx, id, title, body, atMs);
        long now = System.currentTimeMillis();
        if (atMs <= now + 500) {
            removePending(ctx, id);
            showNotification(ctx, id, title, body);
            return;
        }
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) { removePending(ctx, id); showNotification(ctx, id, title, body); return; }
        PendingIntent pi = alarmPendingIntent(ctx, id, title, body);
        boolean exact = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try { exact = am.canScheduleExactAlarms(); } catch (Exception e) { exact = false; }
        }
        try {
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi);
        } catch (SecurityException e) {
            // 精确闹钟权限被系统收回 → 降级为非精确，保证提醒仍可达（可能延迟几分钟）
            try { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi); }
            catch (Exception e2) { removePending(ctx, id); showNotification(ctx, id, title, body); }
        }
    }

    /** 取消一条已调度通知（闹钟 + 托盘 + 持久化记录）。 */
    public static void cancel(Context ctx, int id) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am != null) am.cancel(alarmPendingIntent(ctx, id, "", ""));
        } catch (Exception e) { /* ignore */ }
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(id);
        } catch (Exception e) { /* ignore */ }
        removePending(ctx, id);
    }

    /** 立即弹一条系统通知（不走闹钟），用于自检验证「通知渲染/铃声」路径。 */
    public static void showNotification(Context ctx, int id, String title, String body) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            Notification n = buildNotification(ctx, nm, id, title == null ? "成长提醒" : title, body == null ? "" : body);
            nm.notify(id, n);
        } catch (Exception e) { /* 通知失败绝不崩溃 */ }
    }

    static Notification buildNotification(Context ctx, NotificationManager nm, int id, String title, String body) {
        String channelId = pickChannel(nm);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && channelId != null) {
            b = new Notification.Builder(ctx, channelId);
        } else {
            b = new Notification.Builder(ctx);
            b.setPriority(Notification.PRIORITY_HIGH);
        }
        b.setContentTitle(title)
         .setContentText(body)
         .setStyle(new Notification.BigTextStyle().bigText(body))
         .setCategory(Notification.CATEGORY_REMINDER)
         .setAutoCancel(true)
         .setSmallIcon(R.mipmap.ic_launcher)
         .setContentIntent(contentPendingIntent(ctx, id));
        return b.build();
    }

    /** 渠道选择：铃声渠道 → 兼容渠道 → 系统默认渠道（均由启动时 NotificationChannelsHelper 直建）。 */
    static String pickChannel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null;
        if (nm.getNotificationChannel(NotificationChannelsHelper.CH_RINGTONE) != null)
            return NotificationChannelsHelper.CH_RINGTONE;
        if (nm.getNotificationChannel(NotificationChannelsHelper.CH_FALLBACK) != null)
            return NotificationChannelsHelper.CH_FALLBACK;
        return NotificationChannel.DEFAULT_CHANNEL_ID;
    }

    static PendingIntent alarmPendingIntent(Context ctx, int id, String title, String body) {
        Intent i = new Intent(ctx, NotificationAlarmReceiver.class);
        i.putExtra("id", id);
        i.putExtra("title", title);
        i.putExtra("body", body);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(ctx, id, i, flags);
    }

    static PendingIntent contentPendingIntent(Context ctx, int id) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(ctx, id, i, flags);
    }

    // ==================== 待触发闹钟持久化（重启恢复用） ====================

    static synchronized void addPending(Context ctx, int id, String title, String body, long atMs) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray arr = new JSONArray(sp.getString(KEY_ITEMS, "[]"));
            JSONObject o = new JSONObject();
            o.put("id", id); o.put("title", title); o.put("body", body); o.put("at", atMs);
            JSONArray out = new JSONArray();
            out.put(o);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject it = arr.optJSONObject(i);
                if (it != null && it.optInt("id", -1) != id) out.put(it);
            }
            sp.edit().putString(KEY_ITEMS, out.toString()).apply();
        } catch (Exception e) { /* 持久化失败不影响本次调度 */ }
    }

    static synchronized void removePending(Context ctx, int id) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray arr = new JSONArray(sp.getString(KEY_ITEMS, "[]"));
            JSONArray out = new JSONArray();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject it = arr.optJSONObject(i);
                if (it != null && it.optInt("id", -1) != id) out.put(it);
            }
            sp.edit().putString(KEY_ITEMS, out.toString()).apply();
        } catch (Exception e) { /* ignore */ }
    }

    /** 重启后恢复：过期条目立即弹出，未过期条目重新注册闹钟。由 BootReceiver 调用。 */
    public static synchronized void restoreAll(Context ctx) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray arr = new JSONArray(sp.getString(KEY_ITEMS, "[]"));
            long now = System.currentTimeMillis();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject it = arr.optJSONObject(i);
                if (it == null) continue;
                schedule(ctx, it.optInt("id", 1),
                        it.optString("title", "成长提醒"),
                        it.optString("body", ""),
                        it.optLong("at", now + 1000));
            }
        } catch (Exception e) { /* ignore */ }
    }
}