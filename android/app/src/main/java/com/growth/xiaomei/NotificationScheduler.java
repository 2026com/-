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
 * NotificationManager 直弹（立即通知）已实测可用；AlarmManager 调度存疑。
 * 故采用双保险：
 * ① AlarmManager 定时 —— 优先 setAlarmClock（用户级闹钟：优先级最高、MIUI 清理后台不取消、
 *    状态栏显示闹钟图标），专用后台线程武装，binder 卡死不影响调用方（JS 立即返回）；
 * ② 前台守护服务 ReminderGuardService 每 15s 扫描到期提醒直接弹出（走已验证的 notify 路径）。
 *    防重：闹钟先触发的条目会被移出 pending 列表，guard 只弹「仍在列表」的到期项。
 *
 * 渠道：唯一提醒渠道 growth_notify（铃声=系统默认通知音，用户在系统设置里可换任意铃声）。
 * 持久化：待触发提醒存 SharedPreferences（JSON），重启后由 BootReceiver 恢复。
 */
public final class NotificationScheduler {
    static final String PREFS = "growth_pending_alarms";
    static final String KEY_ITEMS = "items";

    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    private NotificationScheduler() {}

    /** 异步调度：同步登记 pending（guard/重启可见）→ 后台线程武装闹钟。任何 binder 卡死不影响调用方。 */
    public static void scheduleAsync(Context ctx, int id, String title, String body, long atMs) {
        addPending(ctx, id, title, body, atMs);
        ReminderGuardService.ensureRunning(ctx);
        final Context app = ctx.getApplicationContext();
        EXECUTOR.execute(() -> {
            try { armAlarm(app, id, title, body, atMs); }
            catch (Throwable t) { /* AlarmManager 失败由 guard 服务兜底弹出 */ }
        });
    }

    /** 武装定时：setAlarmClock（用户级闹钟，最高优先级）→ 精确闹钟 → 非精确闹钟；已过期立即弹。
     *  每次尝试结果持久化（自检回读定位 ROM 对哪级闹钟放行）。 */
    private static void armAlarm(Context ctx, int id, String title, String body, long atMs) {
        long now = System.currentTimeMillis();
        if (atMs <= now + 500) { fireNow(ctx, id, title, body); return; }
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) { setLastAlarmResult(ctx, "failed(no service)"); fireNow(ctx, id, title, body); return; }
        PendingIntent pi = alarmPendingIntent(ctx, id, title, body);
        // ① setAlarmClock：用户可见闹钟（状态栏闹钟图标），ROM 清理后台不取消、DOZE 必触发
        try {
            AlarmManager.AlarmClockInfo info = new AlarmManager.AlarmClockInfo(atMs, contentPendingIntent(ctx, id));
            am.setAlarmClock(info, pi);
            // 回读验证：部分 ROM（K60 实测）会「接受调用但不登记」——状态栏无闹钟图标、到点不响。
            // 用系统下一次闹钟回读区分「真设上」与「被静默吞掉」，供自检界面展示。
            try {
                AlarmManager.AlarmClockInfo cur = am.getNextAlarmClock();
                if (cur == null) {
                    setLastAlarmResult(ctx, "alarm_clock未登记(ROM未接受)");
                } else if (cur.getTriggerTime() == atMs) {
                    setLastAlarmResult(ctx, "alarm_clock");
                } else {
                    // 系统登记了更早的另一枚闹钟（如其他闹钟App），本条无法确认，按已接受处理
                    setLastAlarmResult(ctx, "alarm_clock(系统登记了更早的其他闹钟)");
                }
            } catch (Throwable t) {
                setLastAlarmResult(ctx, "alarm_clock"); // 回读挂起/失败不影响「已设上」假设
            }
            return;
        } catch (Throwable e) {
            setLastAlarmResult(ctx, "alarm_clock失败:" + e.getClass().getSimpleName());
        }
        // ② 精确闹钟
        try {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi);
            setLastAlarmResult(ctx, "exact");
            return;
        } catch (Throwable e) {
            setLastAlarmResult(ctx, "exact失败:" + e.getClass().getSimpleName());
        }
        // ③ 非精确（可能延迟几分钟）；仍失败由 guard 服务兜底
        try {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi);
            setLastAlarmResult(ctx, "inexact");
        } catch (Throwable e) {
            setLastAlarmResult(ctx, "failed(全部被拦):" + e.getClass().getSimpleName());
        }
    }

    static final String KEY_ALARM_RESULT = "last_alarm_result";

    static void setLastAlarmResult(Context ctx, String result) {
        try {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
               .edit().putString(KEY_ALARM_RESULT, result).apply();
        } catch (Throwable t) { /* ignore */ }
    }

    /** 最近一次闹钟武装结果（自检诊断用）：alarm_clock/exact/inexact/failed... */
    public static String getLastAlarmResult(Context ctx) {
        try {
            return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                      .getString(KEY_ALARM_RESULT, "尚未执行过调度");
        } catch (Throwable t) {
            return "未知";
        }
    }

    private static void fireNow(Context ctx, int id, String title, String body) {
        removePending(ctx, id);
        showNotification(ctx, id, title, body);
    }

    /** 取消一条已调度提醒（尽力取消闹钟 + 清托盘 + 移除持久化记录）。 */
    public static void cancel(Context ctx, int id) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am != null) am.cancel(alarmPendingIntent(ctx, id, "", ""));
        } catch (Throwable e) { /* ignore */ }
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(id);
        } catch (Throwable e) { /* ignore */ }
        removePending(ctx, id);
    }

    /** 立即弹一条系统通知（不走闹钟）。 */
    public static void showNotification(Context ctx, int id, String title, String body) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            Notification n = buildNotification(ctx, nm, id, title == null ? "成长提醒" : title, body == null ? "" : body);
            nm.notify(id, n);
        } catch (Throwable e) { /* 通知失败绝不崩溃 */ }
    }

    /** 查询通知是否真实在系统通知栏中（自检/试响的真实性验证）。 */
    public static boolean isDelivered(Context ctx, int id) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false;
            for (android.service.notification.StatusBarNotification n : nm.getActiveNotifications()) {
                if (n != null && n.getId() == id) return true;
            }
        } catch (Throwable t) { /* ignore */ }
        return false;
    }

    static Notification buildNotification(Context ctx, NotificationManager nm, int id, String title, String body) {
        String cid = resolveChannel(nm);
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

    /** 渠道解析：唯一提醒渠道 growth_notify → 系统默认渠道。 */
    static String resolveChannel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null;
        if (nm.getNotificationChannel(NotificationChannelsHelper.NOTIFY) != null) {
            return NotificationChannelsHelper.NOTIFY;
        }
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

    // ==================== 待触发提醒持久化（guard 扫描 / 重启恢复） ====================

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

    /** 守护服务扫描：弹出所有已到期且仍在 pending 列表的条目（= 闹钟未触发/未设上）。
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
                try {
                    AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
                    if (am != null) am.cancel(alarmPendingIntent(ctx, id, title, body));
                } catch (Throwable t) { /* ignore */ }
                showNotification(ctx, id, title, body);
            }
            sp.edit().putString(KEY_ITEMS, keep.toString()).apply();
        } catch (Throwable t) { /* ignore */ }
    }

    /** 重启后恢复（BootReceiver）：重新武装闹钟（过期的立即弹出）。guard 由打开 App 时拉起。 */
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
                EXECUTOR.execute(() -> {
                    try { armAlarm(app, id, title, body, at); } catch (Throwable t) { /* ignore */ }
                });
            }
        } catch (Throwable t) { /* ignore */ }
    }
}