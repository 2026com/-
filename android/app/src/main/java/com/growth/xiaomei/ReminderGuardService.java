package com.growth.xiaomei;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/**
 * 提醒守护前台服务（双保险的②）：
 * 每 15s 扫描到期提醒并直接弹出（NotificationManager 路径已在该机型实测可用）。
 * 即使 AlarmManager 被 ROM 拦截/调度失败，只要进程存活提醒就能准点响；
 * AlarmManager 先触发的条目会被移出 pending 列表，guard 扫描自动跳过（防双响）。
 * 常驻通知为 IMPORTANCE_MIN 渠道：无声音、不横幅，仅通知抽屉里低调存在。
 */
public class ReminderGuardService extends Service {
    private static final long FIRST_TICK_MS = 3000;
    private static final long TICK_MS = 15000;
    private static final int FOREGROUND_ID = 2001;
    private static volatile boolean sRunning = false;

    private Handler handler;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            try { NotificationScheduler.fireIfDue(ReminderGuardService.this, System.currentTimeMillis()); }
            catch (Throwable t) { /* ignore */ }
            if (handler != null) handler.postDelayed(this, TICK_MS);
        }
    };

    /** 幂等启动（App 启动 / 每次调度新提醒时调用；重复调用无害） */
    public static void ensureRunning(Context ctx) {
        try {
            if (sRunning) return;
            Intent i = new Intent(ctx, ReminderGuardService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i);
            else ctx.startService(i);
        } catch (Throwable t) { /* 启动失败不影响 AlarmManager 主路径 */ }
    }

    /** 守护服务是否存活（自检诊断用：false = 后台到点会失联，只能靠闹钟/锁定卡片） */
    public static boolean isRunning() {
        return sRunning;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        handler = new Handler(Looper.getMainLooper());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            Notification n = buildSilentNotification();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) { // API 34+
                startForeground(FOREGROUND_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(FOREGROUND_ID, n);
            }
            sRunning = true;
        } catch (Throwable t) {
            // 个别 ROM 限制前台服务：降级为普通后台扫描（进程活着仍有效，只是易被杀）
            sRunning = false;
        }
        handler.removeCallbacks(tick);
        handler.postDelayed(tick, FIRST_TICK_MS);
        return START_STICKY;
    }

    private Notification buildSilentNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null
                && nm.getNotificationChannel(NotificationChannelsHelper.CH_GUARD) == null) {
            NotificationChannel c = new NotificationChannel(NotificationChannelsHelper.CH_GUARD, "提醒守护",
                    NotificationManager.IMPORTANCE_MIN);
            c.setDescription("保持提醒准时的后台服务通知（无声）");
            c.setSound(null, null);
            c.enableVibration(false);
            c.setLockscreenVisibility(Notification.VISIBILITY_SECRET);
            nm.createNotificationChannel(c);
        }
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, NotificationChannelsHelper.CH_GUARD)
                : new Notification.Builder(this);
        b.setContentTitle("提醒守护中")
         .setContentText("打卡/闹钟提醒保持准时")
         .setSmallIcon(R.mipmap.ic_launcher)
         .setOngoing(true);
        return b.build();
    }

    @Override
    public void onDestroy() {
        sRunning = false;
        if (handler != null) handler.removeCallbacks(tick);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}