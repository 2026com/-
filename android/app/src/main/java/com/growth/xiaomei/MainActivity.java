package com.growth.xiaomei;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // 注册本地自定义插件（AppBridge：屏幕方向切换等），必须在 super.onCreate 之前
    registerPlugin(AppBridgePlugin.class);
    super.onCreate(savedInstanceState);
  }
}
