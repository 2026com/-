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
    // 清 WebView HTTP 缓存（只清资源缓存，绝不清 IndexedDB/localStorage 用户数据）：
    // 覆盖安装后旧资源残留会导致「新包跑旧 JS」的诡异问题
    try { bridge.getWebView().clearCache(true); } catch (Throwable t) { /* ignore */ }
    // 原生自愈：清 Service Worker 注册 + Cache Storage（PWA 缓存）。
    // 这是「覆盖安装后仍然跑旧包」的元凶：早期版本注册的 SW 会继续吐旧的
    // index.html/JS（clearCache 清不到 SW 存储），表现为修复「不生效」。
    // 幂等注入（1.5s / 4s 各一次，仅本进程一次）；发现残留才自动刷新一次。
    purgeServiceWorkerStorages();
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
    // 进 App 即静默清理积压（原生侧、先于 WebView JS）：划掉后台期间错过的提醒
    // 直接取消其被系统延迟的闹钟并移出待触发列表——不响铃不弹通知。
    // 否则 ROM 会把错过的闹钟「延迟到 App 一打开」补响（NotificationAlarmReceiver），
    // 这正是「每次进 App 都响守护提醒音乐」的来源；JS 冷启动来不及抢在它前面。
    try {
      NotificationScheduler.fireIfDue(getApplicationContext(), System.currentTimeMillis(), true);
    } catch (Throwable t) { /* ignore */ }
    // 电池优化白名单：启动后自动申请（全生命周期最多弹 2 次）。
    // 这是守护服务/熄屏提醒能否存活的前提；此前为手动「保活」按钮（用户从未点过）→ 改为自动。
    maybeRequestBatteryWhitelist();
  }

  /** 反注册全部 Service Worker + 清空 Cache Storage（幂等）；发现残留则刷新页面一次以加载新包 */
  private void purgeServiceWorkerStorages() {
    final String js = "(function(){try{if(!(window.Capacitor&&window.Capacitor.isNativePlatform))return;"
        + "var did=false;"
        + "var p1=navigator.serviceWorker?navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){did=true;r.unregister();});}).catch(function(){}):null;"
        + "var p2=(window.caches&&window.caches.keys)?window.caches.keys().then(function(ks){return Promise.all(ks.map(function(k){did=true;return window.caches.delete(k);}));}).catch(function(){}):null;"
        + "Promise.all([p1,p2]).then(function(){setTimeout(function(){if(did)location.reload();},400);});"
        + "}catch(e){}})();";
    final Runnable inject = new Runnable() {
      @Override public void run() {
        try { bridge.getWebView().evaluateJavascript(js, null); } catch (Throwable t) { /* ignore */ }
      }
    };
    android.os.Handler h = new android.os.Handler(android.os.Looper.getMainLooper());
    h.postDelayed(inject, 1500);
    h.postDelayed(inject, 4000);
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
