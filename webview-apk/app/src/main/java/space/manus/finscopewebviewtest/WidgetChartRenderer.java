package space.manus.finscopewebviewtest;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;

import org.json.JSONArray;

final class WidgetChartRenderer {
  private WidgetChartRenderer() {}

  static Bitmap render(JSONArray points, int width, int height) {
    Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
    Canvas canvas = new Canvas(bitmap);
    Paint grid = new Paint(Paint.ANTI_ALIAS_FLAG);
    grid.setColor(Color.rgb(40, 43, 54));
    grid.setStrokeWidth(1f);
    canvas.drawLine(0, height / 2f, width, height / 2f, grid);

    if (points == null || points.length() < 2) return bitmap;
    float min = Float.MAX_VALUE;
    float max = -Float.MAX_VALUE;
    for (int index = 0; index < points.length(); index++) {
      float value = (float) points.optDouble(index, 0);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    float span = Math.max(max - min, Math.max(0.01f, Math.abs(max) * 0.002f));
    float padding = 5f;
    Path path = new Path();
    for (int index = 0; index < points.length(); index++) {
      float value = (float) points.optDouble(index, min);
      float x = padding + (width - padding * 2f) * index / (points.length() - 1f);
      float y = height - padding - ((value - min) / span) * (height - padding * 2f);
      if (index == 0) path.moveTo(x, y); else path.lineTo(x, y);
    }
    Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
    line.setColor(Color.rgb(128, 255, 112));
    line.setStyle(Paint.Style.STROKE);
    line.setStrokeWidth(3f);
    line.setStrokeJoin(Paint.Join.MITER);
    canvas.drawPath(path, line);
    return bitmap;
  }
}
