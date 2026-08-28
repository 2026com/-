package com.growth.xiaomei;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // 注册本地自定义插件（AppBridge：屏幕方向切换等），必须在 super.onCreate 之前
    registerPlugin(AppBridgePlugin.class);
    super.onCreate(savedInstanceState);
    // 原生侧直建通知渠道（绕开部分 ROM 上 JS 桥 createChannel 挂起的问题；幂等、后台线程）
    NotificationChannelsHelper.ensureCreated(this);
  }
}
