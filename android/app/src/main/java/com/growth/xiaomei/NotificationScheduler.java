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

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 原生通知调度器（彻底绕开 @capacitor/local-notifications 插件桥）。
 *
 * 背景（红米 K60 实测）：该 ROM 上 LocalNotifications 插件桥的通知/闹钟类调用全部永久挂起；
 * NotificationManager 直弹（立即通知）已实测可用；AlarmManager/PendingIntent 链路存疑（自检 4b 挂起）。
 * 故采用双保险：
 * ① AlarmManager 精确定时 —— 专用后台线程武装，binder 卡死不影响调用方（JS 立即返回）；
 * ② 前台守护服务 ReminderGuardService 每 15s 扫描到期提醒直接弹出（走已验证的 notify 路径）。
 *    防重：AlarmManager 先触发的条目会被移出 pending 列表，guard 只弹「仍在列表」的到期项。
 *
 * 持久化：待触发提醒存 SharedPreferences（JSON），重启后由 BootReceiver 恢复。
 */
public final class NotificationScheduler {
    static final String PREFS = "growth_pending_alarms";
    static final String KEY_ITEMS = "items";

    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    private NotificationScheduler() {}

    /** 异步调度：同步登记 pending（guard/重启可见）→ 后台线程武装闹钟。任何 binder 卡死不影响调用方。 */
    public static void scheduleAsync(Context ctx, int id, String title, String body, long atMs, String channel) {
        addPending(ctx, id, title, body, atMs, channel);
        ReminderGuardService.ensureRunning(ctx);
        final Context app = ctx.getApplicationContext();
        EXECUTOR.execute(() -> {
            try { armAlarm(app, id, title, body, atMs, channel); }
            catch (Throwable t) { /* AlarmManager 失败由 guard 服务兜底弹出 */ }
        });
    }

    /** 武装 AlarmManager 闹钟；atMs 已过则立即弹出（立即路径已验证可用）。 */
    private static void armAlarm(Context ctx, int id, String title, String body, long atMs, String channel) {
        long now = System.currentTimeMillis();
        if (atMs <= now + 500) { fireNow(ctx, id, title, body, channel); return; }
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) { fireNow(ctx, id, title, body, channel); return; }
        PendingIntent pi = alarmPendingIntent(ctx, id, title, body, channel);
        boolean exact = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try { exact = am.canScheduleExactAlarms(); } catch (Throwable t) { exact = false; }
        }
        try {
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi);
        } catch (Throwable e) {
            try { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi); } // 降级非精确再试
            catch (Throwable e2) { /* guard 服务兜底 */ }
        }
    }

    private static void fireNow(Context ctx, int id, String title, String body, String channel) {
        removePending(ctx, id);
        showNotification(ctx, id, title, body, channel);
    }

    /** 取消一条已调度提醒（尽力取消闹钟 + 清托盘 + 移除持久化记录）。 */
    public static void cancel(Context ctx, int id) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am != null) am.cancel(alarmPendingIntent(ctx, id, "", "", null));
        } catch (Throwable e) { /* ignore */ }
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(id);
        } catch (Throwable e) { /* ignore */ }
        removePending(ctx, id);
    }

    /** 立即弹一条系统通知（不走闹钟）。channel = 用户所选铃声渠道 id（null 自动选择）。 */
    public static void showNotification(Context ctx, int id, String title, String body, String channel) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            Notification n = buildNotification(ctx, nm, id, title == null ? "成长提醒" : title, body == null ? "" : body, channel);
            nm.notify(id, n);
        } catch (Throwable e) { /* 通知失败绝不崩溃 */ }
    }

    static Notification buildNotification(Context ctx, NotificationManager nm, int id, String title, String body, String channel) {
        String cid = resolveChannel(nm, channel);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && cid != null) {
            b = new Notification.Builder(ctx, cid);
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

    /** 渠道解析：用户所选铃声渠道 → 历史渠道回退链 → 系统默认渠道。 */
    static String resolveChannel(NotificationManager nm, String channel) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null;
        if (channel != null && nm.getNotificationChannel(channel) != null) return channel;
        String[] chain = {
                NotificationChannelsHelper.RING_ALARM,
                NotificationChannelsHelper.RING_DEFAULT,
                "growth_v3",
                NotificationChannelsHelper.CH_FALLBACK,
        };
        for (String cid : chain) {
            if (nm.getNotificationChannel(cid) != null) return cid;
        }
        return NotificationChannel.DEFAULT_CHANNEL_ID;
    }

    static PendingIntent alarmPendingIntent(Context ctx, int id, String title, String body, String channel) {
        Intent i = new Intent(ctx, NotificationAlarmReceiver.class);
        i.putExtra("id", id);
        i.putExtra("title", title);
        i.putExtra("body", body);
        i.putExtra("channel", channel);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(ctx, id, i, flags);
    }

    static PendingIntent contentPendingIntent(Context ctx, int id) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(ctx, id, i, flags);
    }

    // ==================== 待触发提醒持久化（guard 扫描 / 重启恢复） ====================

    static synchronized void addPending(Context ctx, int id, String title, String body, long atMs, String channel) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray arr = new JSONArray(sp.getString(KEY_ITEMS, "[]"));
            JSONObject o = new JSONObject();
            o.put("id", id); o.put("title", title); o.put("body", body);
            o.put("at", atMs); o.put("channel", channel == null ? "" : channel);
            JSONArray out = new JSONArray();
            out.put(o);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject it = arr.optJSONObject(i);
                if (it != null && it.optInt("id", -1) != id) out.put(it);
            }
            sp.edit().putString(KEY_ITEMS, out.toString()).apply();
        } catch (Throwable t) { /* 持久化失败不影响本次调度 */ }
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
        } catch (Throwable t) { /* ignore */ }
    }

    /** 守护服务扫描：弹出所有已到期且仍在 pending 列表的条目（= AlarmManager 未触发/未设上）。
     *  弹出前尽力取消对应闹钟防双响（失败无害）。 */
    public static synchronized void fireIfDue(Context ctx, long now) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray arr = new JSONArray(sp.getString(KEY_ITEMS, "[]"));
            if (arr.length() == 0) return;
            JSONArray keep = new JSONArray();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject it = arr.optJSONObject(i);
                if (it == null) continue;
                long at = it.optLong("at", 0);
                if (at > now) { keep.put(it); continue; }
                int id = it.optInt("id", 1);
                String title = it.optString("title", "成长提醒");
                String body = it.optString("body", "");
                String ch = it.optString("channel", "");
                try {
                    AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
                    if (am != null) am.cancel(alarmPendingIntent(ctx, id, title, body, ch));
                } catch (Throwable t) { /* ignore */ }
                showNotification(ctx, id, title, body, ch);
            }
            sp.edit().putString(KEY_ITEMS, keep.toString()).apply();
        } catch (Throwable t) { /* ignore */ }
    }

    /** 重启后恢复（BootReceiver）：重新武装闹钟（过期的立即弹出）。不拉 guard——由打开 App 时拉起。 */
    public static synchronized void restoreAll(Context ctx) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray arr = new JSONArray(sp.getString(KEY_ITEMS, "[]"));
            final Context app = ctx.getApplicationContext();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject it = arr.optJSONObject(i);
                if (it == null) continue;
                final int id = it.optInt("id", 1);
                final String title = it.optString("title", "成长提醒");
                final String body = it.optString("body", "");
                final long at = it.optLong("at", System.currentTimeMillis() + 1000);
                final String ch = it.optString("channel", "");
                EXECUTOR.execute(() -> {
                    try { armAlarm(app, id, title, body, at, ch); } catch (Throwable t) { /* ignore */ }
                });
            }
        } catch (Throwable t) { /* ignore */ }
    }
}