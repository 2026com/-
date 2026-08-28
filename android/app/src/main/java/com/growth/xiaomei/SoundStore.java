package com.growth.xiaomei;

import android.content.Context;
import android.net.Uri;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * 提醒铃声文件桥：res/raw/*.wav → 应用外部目录（external-files/ln_sounds）→ FileProvider content:// URI。
 *
 * 背景（红米 K60 实测）：android.resource:// 形式的渠道铃声 URI 在该 ROM 上「存得住、放不出」——
 * 渠道创建成功但触发时静默无声；改用 content://（Capacitor 官方插件对 assets 声音的同款做法）全 ROM 可靠。
 */
public final class SoundStore {

    private SoundStore() {}

    /** 解析铃声 content URI；失败返回 null（调用方回落系统默认音）。name 不带扩展名。 */
    public static Uri soundUri(Context ctx, String name) {
        try {
            File f = ensureFile(ctx, name);
            if (f == null) return null;
            String authority = ctx.getPackageName() + ".fileprovider";
            return FileProvider.getUriForFile(ctx, authority, f);
        } catch (Throwable t) {
            return null;
        }
    }

    /** 把 res/raw/<name>.wav 复制到 external-files/ln_sounds/<name>.wav（幂等，已存在且非空则复用）。 */
    private static File ensureFile(Context ctx, String name) {
        try {
            File dir = new File(ctx.getExternalFilesDir(null), "ln_sounds");
            if (!dir.exists()) dir.mkdirs();
            File out = new File(dir, name + ".wav");
            if (out.exists() && out.length() > 0) return out;
            InputStream in = ctx.getResources().openRawResource(
                    ctx.getResources().getIdentifier(name, "raw", ctx.getPackageName()));
            OutputStream os = new FileOutputStream(out);
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            os.flush();
            os.close();
            in.close();
            return out;
        } catch (Throwable t) {
            return null;
        }
    }
}