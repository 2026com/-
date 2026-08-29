package com.growth.xiaomei;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 开机完成接收器：重启后恢复所有未触发的提醒闹钟
 * （AlarmManager 闹钟不跨重启；RECEIVE_BOOT_COMPLETED 权限已在 Manifest 声明）。
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        try {
            NotificationScheduler.restoreAll(context);
        } catch (Exception e) { /* ignore */ }
        // 重启后同时拉起守护服务（熄屏兜底扫描与闹钟恢复双保险，幂等）
        try {
            ReminderGuardService.ensureRunning(context);
        } catch (Exception e) { /* ignore */ }
    }
}