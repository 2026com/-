package com.growth.xiaomei;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // 注册本地自定义插件（AppBridge：屏幕方向切换/退出App等），必须在 super.onCreate 之前
    registerPlugin(AppBridgePlugin.class);
    super.onCreate(savedInstanceState);
    // 原生侧直建通知渠道（绕开部分 ROM 上 JS 桥 createChannel 挂起的问题；幂等、后台线程）
    NotificationChannelsHelper.ensureCreated(this);
    // 拉起提醒守护前台服务（App 内到点兜底弹出，双保险之一；幂等）
    ReminderGuardService.ensureRunning(this);
    // 返回键 / 侧滑返回手势：不再让系统默认行为直接退出 App，
    // 改为向 WebView 派发 'backbutton' 事件，由前端统一决策
    // （关浮层 → 回首页 → 2 秒内双击才调用 AppBridge.exitApp 退出，见 App.jsx）。
    // 本回调在 super.onCreate 之后注册 = 优先级最高（LIFO），会覆盖 Capacitor 默认返回处理。
    getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
      @Override
      public void handleOnBackPressed() {
        bridge.triggerJSEvent("backbutton", "window");
      }
    });
    // 电池优化白名单：启动后自动申请（全生命周期最多弹 2 次）。
    // 这是守护服务/熄屏提醒能否存活的前提；此前为手动「保活」按钮（用户从未点过）→ 改为自动。
    maybeRequestBatteryWhitelist();
  }

  private void maybeRequestBatteryWhitelist() {
    try {
      android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
      final String pkg = getPackageName();
      if (pm == null || pm.isIgnoringBatteryOptimizations(pkg)) return;
      android.content.SharedPreferences sp = getSharedPreferences("growth_pending_alarms", MODE_PRIVATE);
      int n = sp.getInt("battery_req_attempts", 0);
      if (n >= 2) return;
      sp.edit().putInt("battery_req_attempts", n + 1).apply();
      new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(new Runnable() {
        @Override
        public void run() {
          try {
            startActivity(new android.content.Intent(
                android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                android.net.Uri.parse("package:" + pkg)));
          } catch (Throwable t) { /* ignore */ }
        }
      }, 2500);
    } catch (Throwable t) { /* ignore */ }
  }
}
