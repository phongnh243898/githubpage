import open3d as o3d
import numpy as np
import json
import os
import sys

# Bước 1: Định nghĩa bảng ánh xạ ID sang phím tắt ngay tại Python
CATEGORY_TO_KEY = {
    205340: 'A',  # undrivable
    205341: 'S',  # things
    205342: 'D',  # construction
    205343: 'F'   # uneven
}

def generate_js_drawing_code(pcd_file_path, json_file_path, resolution=0.1):
    try:
        pcd = o3d.io.read_point_cloud(pcd_file_path)
        if not pcd.has_points(): return
        points = np.asarray(pcd.points)
        min_x, max_x = np.min(points[:, 0]), np.max(points[:, 0])
        min_y, max_y = np.min(points[:, 1]), np.max(points[:, 1])
        x_range, y_range = (min_x - 10, max_x + 10), (min_y - 10, max_y + 10)
        width = int((x_range[1] - x_range[0]) / resolution)
        height = int((y_range[1] - y_range[0]) / resolution)
    except Exception as e:
        print(f"Lỗi: {e}")
        return

    with open(json_file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Bước 2: Python xử lý logic lựa chọn phím trước khi gửi
    drawing_commands = []
    for ann in data.get("annotations", []):
        cmd = {
            "key": CATEGORY_TO_KEY.get(ann.get('category_id'), ''), # Lấy phím tắt tương ứng
            "points": []
        }
        for pt in ann['location']:
            px = (pt['x'] - x_range[0]) / resolution
            py = height + 1 - ((pt['y'] - y_range[0]) / resolution)
            cmd["points"].append({"rx": px / width, "ry": py / height})
        drawing_commands.append(cmd)

    # Bước 3: JS chỉ việc nhận lệnh và thực thi "máy móc"
    js_content = (
        "(async function(cmds){"
        "  const t=document.querySelector('.drawingSVG'); if(!t) return;"
        "  const w=m=>new Promise(r=>setTimeout(r,m));"
        "  const old=page.fn.drawing.resetPopupTag; page.fn.drawing.resetPopupTag=()=>{};"
        "  for(const c of cmds){"
        "    page.fn.drawing.startNewDrawing(page.constants.method.drawPolygon);"
        "    await w(150); const r=t.getBoundingClientRect();"
        "    for(const p of c.points){"
        "      t.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:r.left+p.rx*r.width,clientY:r.top+p.ry*r.height}));"
        "      await w(100);"
        "    }"
        "    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',keyCode:27,bubbles:true}));"
        "    await w(350);"
        "    if(c.key){" # Nếu có phím tắt từ Python gửi sang, nhấn luôn
        "      console.log('Auto-selecting category:', c.key);"
        "      document.dispatchEvent(new KeyboardEvent('keydown',{key:c.key.toLowerCase(),code:'Key'+c.key,shiftKey:true,bubbles:true}));"
        "      await w(200);"
        "    }"
        "  } page.fn.drawing.resetPopupTag=old;"
        f"}})({json.dumps(drawing_commands)});"
    )

    with open(json_file_path.replace('.json', '_auto.txt'), 'w', encoding='utf-8') as f:
        f.write(js_content)
    print("Đã tạo file JS với logic category xử lý từ Python.")

if __name__ == "__main__":
    PCD_P, JSON_P = sys.argv[1].replace('"',''), sys.argv[2].replace('"','')
    generate_js_drawing_code(PCD_P, JSON_P)