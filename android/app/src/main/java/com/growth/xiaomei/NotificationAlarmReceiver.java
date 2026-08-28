package com.growth.xiaomei;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 闹钟触发接收器：到点由 AlarmManager 唤醒，直接弹系统通知。
 * 对应 Capacitor 插件的 TimedNotificationPublisher 角色，但走自有代码路径。
 */
public class NotificationAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            int id = intent.getIntExtra("id", -1);
            if (id == -1) return;
            String title = intent.getStringExtra("title");
            String body = intent.getStringExtra("body");
            String channel = intent.getStringExtra("channel");
            NotificationScheduler.removePending(context, id);
            NotificationScheduler.showNotification(context, id, title, body, channel);
        } catch (Exception e) { /* 触发失败绝不崩溃 */ }
    }
}