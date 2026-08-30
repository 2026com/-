package com.growth.xiaomei;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 闹钟触发接收器：到点由 AlarmManager 唤醒，直接弹系统通知。
 * 【关键·迟到抑制】部分 ROM（K60/MIUI）会把「后台期间错过的闹钟」延迟到
 * App 进程下次被启动时才补发——表现为「每次打开 App 都响一遍守护提醒音乐」，
 * 且广播直接拉起进程跑本接收器，不经过 MainActivity/JS，任何 JS 静默都拦不到。
 * 因此：实际触发时间比计划时间晚 60 秒以上 = ROM 延迟补发 → 只清积压，不响铃不弹。
 */
public class NotificationAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            int id = intent.getIntExtra("id", -1);
            if (id == -1) return;
            String title = intent.getStringExtra("title");
            String body = intent.getStringExtra("body");
            long at = intent.getLongExtra("at", 0L);
            long now = System.currentTimeMillis();
            boolean lateCatchUp = at > 0L && (now - at) > 60_000L;   // 迟到 60 秒以上 = 延迟补发
            NotificationScheduler.removePending(context, id);
            if (!lateCatchUp) {
                NotificationScheduler.showNotification(context, id, title, body);
            }
        } catch (Exception e) { /* 触发失败绝不崩溃 */ }
    }
}