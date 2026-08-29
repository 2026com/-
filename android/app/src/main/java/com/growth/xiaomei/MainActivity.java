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
  }
}
