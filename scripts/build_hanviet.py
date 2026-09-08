#!/usr/bin/env python3
"""Dựng bảng **âm Hán-Việt** (hanviet.json) và **pinyin** (pinyin.json) cho từng chữ Hán.

Nguồn: Unihan của Unicode (trường `kVietnamese` trong Unihan_Readings.txt) — tệp chính thức, tải
một lần rồi cache ở cache/Unihan.zip. Bảng này để: đọc tên riêng theo âm Hán-Việt (韩立 → Hàn Lập),
sửa họ người trước từ xưng hô (马道友 → Mã đạo hữu) và hiện dòng Hán-Việt của cả câu.

  py scripts/build_hanviet.py
"""
from __future__ import annotations

import json
import os
import sys
import zipfile

import requests

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "frontend", "src", "data", "hanviet.json")
OUT_PINYIN = os.path.join(ROOT, "frontend", "public", "data", "pinyin.json")
CACHE = os.path.join(ROOT, "cache", "Unihan.zip")
URL = "https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip"

# Chữ giản thể hay gặp mà Unihan bỏ trống âm (Unihan thiên về chữ phồn thể).
EXTRA = {
    "专": "chuyên", "业": "nghiệp", "东": "đông", "丝": "ti", "两": "lưỡng", "严": "nghiêm",
    "个": "cá", "临": "lâm", "丹": "đan", "为": "vi", "丽": "lệ", "举": "cử",
    "么": "ma", "义": "nghĩa", "乐": "lạc", "乒": "binh", "乓": "bang", "乔": "kiều",
    "习": "tập", "书": "thư", "买": "mãi", "争": "tranh", "亏": "khuy", "云": "vân",
    "产": "sản", "亮": "lượng", "亲": "thân", "仅": "cận", "从": "tòng", "仙": "tiên",
    "以": "dĩ", "仪": "nghi", "们": "môn", "众": "chúng", "优": "ưu", "伙": "hỏa",
    "会": "hội", "伞": "tán", "传": "truyện", "伦": "luân", "伸": "thân", "但": "đãn",
    "体": "thể", "何": "hà", "佩": "bội", "倆": "lưỡng", "值": "trị", "假": "giả",
    "做": "tố", "偷": "thâu", "傀": "khôi", "傻": "sỏa", "僵": "cương", "儡": "lỗi",
    "儿": "nhi", "兒": "nhi", "兰": "lan", "关": "quan", "兴": "hưng", "养": "dưỡng",
    "兽": "thú", "写": "tả", "军": "quân", "农": "nông", "冥": "minh", "冲": "xung",
    "决": "quyết", "净": "tịnh", "凉": "lương", "减": "giảm", "凤": "phượng", "击": "kích",
    "刀": "đao", "划": "hoạch", "刘": "lưu", "刚": "cương", "创": "sáng", "别": "biệt",
    "制": "chế", "剑": "kiếm", "剔": "dịch", "剩": "thặng", "办": "biện", "务": "vụ",
    "动": "động", "努": "nỗ", "劫": "kiếp", "励": "lệ", "劳": "lao", "势": "thế",
    "匀": "quân", "匙": "chủy", "区": "khu", "医": "y", "匿": "nặc", "华": "hoa",
    "单": "đơn", "卖": "mại", "卜": "bốc", "卡": "ca", "卤": "lỗ", "卧": "ngọa",
    "卫": "vệ", "厂": "xưởng", "厅": "sảnh", "历": "lịch", "厉": "lệ", "压": "áp",
    "厌": "yếm", "厨": "trù", "参": "tham", "发": "phát", "变": "biến", "叶": "diệp",
    "吗": "ma", "吞": "thôn", "启": "khải", "告": "cáo", "员": "viên", "咒": "chú",
    "咖": "ca", "售": "thụ", "啡": "phê", "喊": "hảm", "喬": "kiều", "喷": "phún",
    "嗽": "thấu", "嘛": "ma", "嘴": "chủy", "噬": "phệ", "嚇": "hách", "囊": "nang",
    "团": "đoàn", "园": "viên", "围": "vi", "国": "quốc", "图": "đồ", "圣": "thánh",
    "场": "trường", "坐": "tọa", "块": "khối", "坚": "kiên", "坛": "đàn", "型": "hình",
    "堵": "đổ", "塔": "tháp", "墙": "tường", "墨": "mặc", "声": "thanh", "壳": "xác",
    "壶": "hồ", "处": "xứ", "备": "bị", "夏": "hạ", "够": "cấu", "夠": "cấu",
    "头": "đầu", "夹": "giáp", "奋": "phấn", "契": "khế", "奖": "tưởng", "套": "sáo",
    "她": "tha", "妆": "trang", "妈": "ma", "妖": "yêu", "妙": "diệu", "姆": "mỗ",
    "姜": "khương", "娱": "ngu", "婚": "hôn", "婴": "anh", "媚": "mị", "学": "học",
    "它": "tha", "宗": "tông", "宝": "bảo", "实": "thực", "宠": "sủng", "宫": "cung",
    "宵": "tiêu", "宽": "khoan", "宾": "tân", "对": "đối", "导": "đạo", "将": "tương",
    "尊": "tôn", "尝": "thường", "尤": "vưu", "尬": "giới", "就": "tựu", "尴": "giam",
    "尿": "niệu", "层": "tằng", "属": "thuộc", "屠": "đồ", "岁": "tuế", "岛": "đảo",
    "岭": "lĩnh", "岳": "nhạc", "峰": "phong", "巨": "cự", "巩": "củng", "币": "tệ",
    "师": "sư", "帝": "đế", "带": "đới", "帮": "bang", "幕": "mạc", "幡": "phan",
    "幫": "bang", "并": "tịnh", "幸": "hạnh", "幻": "huyễn", "幽": "u", "幾": "kỷ",
    "广": "quảng", "庆": "khánh", "应": "ứng", "开": "khai", "异": "dị", "弃": "khí",
    "弑": "thí", "张": "trương", "弯": "loan", "弹": "đạn", "强": "cường", "归": "quy",
    "当": "đương", "录": "lục", "径": "kính", "很": "ngận", "徒": "đồ", "态": "thái",
    "怕": "phạ", "怡": "di", "怪": "quái", "总": "tổng", "恶": "ác", "悄": "tiễu",
    "悟": "ngộ", "您": "nâm", "惯": "quán", "惰": "nọa", "慧": "tuệ", "懂": "đổng",
    "懒": "lãn", "懶": "lãn", "戏": "hí", "战": "chiến", "戮": "lục", "戶": "hộ",
    "扫": "tảo", "扬": "dương", "扮": "bạn", "抖": "đẩu", "抢": "thưởng", "护": "hộ",
    "报": "báo", "抬": "đài", "抹": "mạt", "拟": "nghĩ", "择": "trạch", "挡": "đáng",
    "挤": "tễ", "挥": "huy", "挺": "đĩnh", "换": "hoán", "探": "thám", "換": "hoán",
    "搅": "giảo", "搶": "thưởng", "摆": "bãi", "摇": "dao", "摔": "suất", "擊": "kích",
    "擋": "đáng", "操": "thao", "擎": "kình", "擔": "đảm", "改": "cải", "敌": "địch",
    "数": "số", "斯": "tư", "斷": "đoạn", "无": "vô", "既": "ký", "旧": "cựu",
    "时": "thời", "春": "xuân", "昨": "tạc", "显": "hiển", "晒": "sái", "晰": "tích",
    "晾": "lượng", "暂": "tạm", "暖": "noãn", "曦": "hi", "术": "thuật", "杀": "sát",
    "杂": "tạp", "权": "quyền", "材": "tài", "条": "điều", "来": "lai", "极": "cực",
    "析": "tích", "枪": "thương", "柠": "ninh", "标": "tiêu", "树": "thụ", "样": "dạng",
    "桌": "trác", "档": "đáng", "梦": "mộng", "检": "kiểm", "椅": "y", "楼": "lâu",
    "概": "khái", "榄": "lãm", "橄": "cảm", "欢": "hoan", "欧": "âu", "歲": "tuế",
    "殿": "điện", "毽": "kiện", "气": "khí", "氛": "phân", "汇": "hối", "汉": "hán",
    "汤": "thang", "汪": "uông", "汽": "khí", "没": "một", "泉": "tuyền", "泳": "vịnh",
    "洱": "nhị", "浆": "tương", "浇": "kiêu", "测": "trắc", "浓": "nùng", "浩": "hạo",
    "浪": "lãng", "涌": "dũng", "淇": "kỳ", "淬": "tối", "渐": "tiệm", "渡": "độ",
    "游": "du", "湿": "thấp", "满": "mãn", "滤": "lự", "漱": "sấu", "澡": "táo",
    "灭": "diệt", "灯": "đăng", "灵": "linh", "炉": "lô", "炎": "viêm", "為": "vi",
    "烦": "phiền", "烧": "thiêu", "热": "nhiệt", "焖": "muộn", "焚": "phần", "焦": "tiêu",
    "焱": "diễm", "煎": "tiễn", "煞": "sát", "煮": "chử", "煲": "bảo", "爆": "bạo",
    "爱": "ái", "父": "phụ", "爷": "gia", "爸": "ba", "犒": "khao", "状": "trạng",
    "犹": "do", "狈": "bái", "独": "độc", "猜": "sai", "猪": "trư", "猫": "miêu",
    "獎": "tưởng", "玄": "huyền", "率": "suất", "玛": "mã", "环": "hoàn", "现": "hiện",
    "琪": "kỳ", "琳": "lâm", "甜": "điềm", "申": "thân", "电": "điện", "画": "họa",
    "疑": "nghi", "痒": "dương", "盐": "diêm", "监": "giám", "盖": "cái", "盘": "bàn",
    "直": "trực", "着": "trước", "睁": "tranh", "睛": "tình", "睡": "thụy", "瞧": "tiều",
    "瞬": "thuấn", "码": "mã", "砍": "khảm", "砖": "chuyên", "砸": "tạp", "础": "sở",
    "硅": "quy", "确": "xác", "碌": "lục", "碑": "bi", "碗": "uyển", "碟": "điệp",
    "碰": "bính", "磁": "từ", "祖": "tổ", "神": "thần", "禁": "cấm", "离": "ly",
    "种": "chủng", "秘": "bí", "积": "tích", "稍": "sảo", "穹": "khung", "窍": "khiếu",
    "窥": "khuy", "笑": "tiếu", "笼": "lung", "筐": "khuông", "筷": "khoái", "签": "thiêm",
    "简": "giản", "篇": "thiên", "篮": "lam", "籍": "tịch", "米": "mễ", "类": "loại",
    "粥": "chúc", "糕": "cao", "糟": "tao", "紧": "khẩn", "紫": "tử", "红": "hồng",
    "约": "ước", "级": "cấp", "纪": "kỷ", "纸": "chỉ", "线": "tuyến", "练": "luyện",
    "组": "tổ", "细": "tế", "终": "chung", "绍": "thiệu", "经": "kinh", "结": "kết",
    "给": "cấp", "络": "lạc", "绝": "tuyệt", "统": "thống", "继": "kế", "绩": "tích",
    "续": "tục", "维": "duy", "绿": "lục", "缀": "chuế", "缈": "miểu", "编": "biên",
    "缘": "duyên", "缚": "phọc", "网": "võng", "罗": "la", "罚": "phạt", "罡": "cang",
    "羞": "tu", "翻": "phiên", "者": "giả", "而": "nhi", "耐": "nại", "耶": "da",
    "聊": "liêu", "职": "chức", "联": "liên", "聪": "thông", "肉": "nhục", "肌": "cơ",
    "肚": "đỗ", "肤": "phu", "肩": "kiên", "胃": "vị", "胡": "hồ", "脆": "thúy",
    "脉": "mạch", "脊": "tích", "脏": "tạng", "脑": "não", "脖": "bột", "脚": "cước",
    "脸": "kiểm", "腳": "cước", "腾": "đằng", "膀": "bàng", "舔": "thiểm", "节": "tiết",
    "芒": "mang", "苍": "thương", "苏": "tô", "苹": "bình", "荐": "tiến", "荣": "vinh",
    "药": "dược", "荷": "hà", "莉": "lị", "获": "hoạch", "莹": "oánh", "菜": "thái",
    "菠": "ba", "萄": "đào", "萨": "tát", "葡": "bồ", "葱": "thông", "蓝": "lam",
    "蔬": "sơ", "蕴": "uẩn", "薯": "thự", "藏": "tàng", "蘸": "trám", "虚": "hư",
    "虽": "tuy", "虾": "hà", "蛋": "đản", "蛙": "oa", "蛟": "giao", "蜕": "thoát",
    "蜡": "lạp", "融": "dung", "街": "nhai", "补": "bổ", "装": "trang", "裡": "lý",
    "裤": "khố", "见": "kiến", "观": "quan", "规": "quy", "视": "thị", "觉": "giác",
    "触": "xúc", "該": "cai", "詹": "chiêm", "誓": "thệ", "說": "thuyết", "誰": "thùy",
    "计": "kế", "订": "đính", "认": "nhận", "讨": "thảo", "让": "nhượng", "训": "huấn",
    "议": "nghị", "记": "ký", "讲": "giảng", "讶": "nhạ", "许": "hứa", "论": "luận",
    "设": "thiết", "诀": "quyết", "证": "chứng", "评": "bình", "识": "thức", "诉": "tố",
    "词": "từ", "译": "dịch", "试": "thí", "诗": "thi", "诚": "thành", "话": "thoại",
    "诞": "đản", "询": "tuân", "该": "cai", "语": "ngữ", "误": "ngộ", "说": "thuyết",
    "请": "thỉnh", "诺": "nặc", "读": "độc", "课": "khóa", "谁": "thùy", "调": "điều",
    "谊": "nghị", "谢": "tạ", "谦": "khiêm", "谱": "phổ", "谷": "cốc", "豫": "dự",
    "貌": "mạo", "貼": "thiếp", "賺": "trám", "賽": "tái", "贏": "doanh", "贝": "bối",
    "负": "phụ", "财": "tài", "责": "trách", "败": "bại", "账": "trướng", "货": "hóa",
    "质": "chất", "购": "cấu", "贱": "tiện", "贴": "thiếp", "贵": "quý", "费": "phí",
    "贺": "hạ", "贼": "tặc", "资": "tư", "赏": "thưởng", "赐": "tứ", "赚": "trám",
    "赛": "tái", "赞": "tán", "赢": "doanh", "赶": "cản", "趕": "cản", "趟": "thảng",
    "趴": "pha", "跑": "bào", "跤": "giao", "踢": "thích", "蹲": "tồn", "躲": "đóa",
    "车": "xa", "转": "chuyển", "轮": "luân", "软": "nhuyễn", "轻": "khinh", "载": "tải",
    "较": "giảo", "辆": "lượng", "辈": "bối", "辑": "tập", "输": "thâu", "辦": "biện",
    "边": "biên", "达": "đạt", "过": "quá", "运": "vận", "还": "hoàn", "这": "giá",
    "进": "tiến", "连": "liên", "适": "thích", "选": "tuyển", "這": "giá", "逛": "cuống",
    "遁": "độn", "遍": "biến", "遗": "di", "遥": "dao", "邀": "yêu", "邪": "tà",
    "邮": "bưu", "郁": "uất", "酒": "tửu", "酪": "lạc", "酱": "tương", "酸": "toan",
    "醋": "thố", "释": "thích", "量": "lượng", "针": "châm", "钟": "chung", "钥": "thược",
    "钱": "tiền", "铁": "thiết", "铃": "linh", "铠": "khải", "银": "ngân", "链": "liên",
    "锁": "tỏa", "锅": "oa", "错": "thác", "键": "kiện", "镇": "trấn", "镜": "kính",
    "长": "trường", "门": "môn", "闭": "bế", "问": "vấn", "闯": "sấm", "间": "gian",
    "闹": "náo", "闻": "văn", "阁": "các", "阅": "duyệt", "队": "đội", "阳": "dương",
    "阴": "âm", "阵": "trận", "阶": "giai", "阿": "a", "际": "tế", "陆": "lục",
    "陈": "trần", "陌": "mạch", "陨": "vẫn", "陪": "bồi", "随": "tùy", "难": "nan",
    "雨": "vũ", "雪": "tuyết", "雯": "văn", "需": "nhu", "霞": "hà", "静": "tĩnh",
    "靜": "tĩnh", "靠": "kháo", "面": "diện", "靴": "ngoa", "鞭": "tiên", "韩": "hàn",
    "韵": "vận", "页": "hiệt", "顶": "đỉnh", "项": "hạng", "顺": "thuận", "须": "tu",
    "顾": "cố", "顿": "đốn", "颂": "tụng", "预": "dự", "频": "tần", "题": "đề",
    "颜": "nhan", "额": "ngạch", "风": "phong", "飞": "phi", "食": "thực", "餐": "xan",
    "餓": "ngạ", "饭": "phạn", "饮": "ẩm", "饰": "sức", "饱": "bão", "饺": "giảo",
    "饼": "bính", "饿": "ngạ", "馅": "hãm", "馆": "quán", "马": "mã", "骄": "kiêu",
    "验": "nghiệm", "骑": "kỵ", "骤": "sậu", "髓": "tủy", "鬆": "tùng", "魔": "ma",
    "鱼": "ngư", "鲜": "tiên", "鸡": "kê", "麒": "kỳ", "麟": "lân", "麦": "mạch",
    "麼": "ma", "黏": "niêm", "鼎": "đỉnh", "鼓": "cổ", "鼻": "tị", "齐": "tề",
    "齿": "xỉ", "龄": "linh", "龙": "long",
}


def download() -> bytes:
    if os.path.exists(CACHE) and os.path.getsize(CACHE) > 1_000_000:
        print(f"dùng lại {CACHE}")
        return open(CACHE, "rb").read()
    print(f"tải {URL} …")
    r = requests.get(URL, timeout=180, headers={"User-Agent": "subloop-build/1.0"})
    r.raise_for_status()
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    open(CACHE, "wb").write(r.content)
    print(f"lưu {CACHE} ({len(r.content) / 1e6:.1f} MB)")
    return r.content


# Unihan chọn âm hiếm cho vài chữ RẤT hay gặp (子 ra "tí" thay vì "tử"). Bảng này ĐÈ lên Unihan.
OVERRIDE = {
    "子": "tử", "里": "lý", "怎": "chẩm", "好": "hảo", "候": "hậu", "看": "khán", "少": "thiếu",
    "行": "hành", "为": "vi", "重": "trọng", "空": "không", "间": "gian", "分": "phân", "长": "trường",
    "还": "hoàn", "过": "quá", "着": "trước", "了": "liễu", "地": "địa", "得": "đắc", "把": "bả",
    "被": "bị", "从": "tòng", "已": "dĩ", "经": "kinh", "只": "chỉ", "些": "ta", "样": "dạng",
    "点": "điểm", "定": "định", "身": "thân", "力": "lực", "心": "tâm", "手": "thủ", "眼": "nhãn",
    "口": "khẩu", "生": "sinh", "死": "tử", "血": "huyết", "命": "mệnh", "神": "thần", "气": "khí",
}


def clean(reading: str) -> str:
    """kVietnamese ghi 'nhân' hoặc 'nhân nhơn'; lấy âm đầu, bỏ mọi thứ trong ngoặc."""
    first = reading.split()[0] if reading.split() else ""
    return first.strip().lower()


def main() -> None:
    blob = download()
    table: dict[str, str] = {}
    with zipfile.ZipFile(os.path.join(CACHE)) as z:
        with z.open("Unihan_Readings.txt") as f:
            for raw in f:
                line = raw.decode("utf-8", "replace")
                if not line.startswith("U+"):
                    continue
                parts = line.rstrip("\n").split("\t")
                if len(parts) < 3 or parts[1] != "kVietnamese":
                    continue
                ch = chr(int(parts[0][2:], 16))
                val = clean(parts[2])
                if val:
                    table[ch] = val
    print(f"Unihan cho {len(table)} chữ")
    for ch, val in OVERRIDE.items():
        table[ch] = val
    print(f"đè {len(OVERRIDE)} chữ Unihan đọc sai âm hay dùng")
    added = 0
    for ch, val in EXTRA.items():
        if ch not in table:
            table[ch] = val
            added += 1
    print(f"thêm tay {added} chữ giản thể Unihan bỏ trống")
    # pinyin (kMandarin) — để hiện dòng phiên âm cho video KHÔNG có sẵn pinyin trong phụ đề
    pin: dict[str, str] = {}
    with zipfile.ZipFile(CACHE) as z:
        with z.open("Unihan_Readings.txt") as f:
            for raw in f:
                line = raw.decode("utf-8", "replace")
                if not line.startswith("U+"):
                    continue
                parts = line.rstrip("\n").split("\t")
                if len(parts) < 3 or parts[1] != "kMandarin":
                    continue
                code = int(parts[0][2:], 16)
                if not (0x4E00 <= code <= 0x9FFF or 0x3400 <= code <= 0x4DBF):
                    continue
                val = parts[2].split()[0].strip()
                if val:
                    pin[chr(code)] = val
    os.makedirs(os.path.dirname(OUT_PINYIN), exist_ok=True)
    with open(OUT_PINYIN, "w", encoding="utf-8") as f:
        json.dump(pin, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    print(f"Ghi {len(pin)} chữ pinyin vào {OUT_PINYIN} ({os.path.getsize(OUT_PINYIN) / 1024:.0f} KB)")

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(table, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    print(f"Ghi {len(table)} chữ vào {OUT} ({os.path.getsize(OUT) / 1024:.0f} KB)")
    # thử vài chữ hay gặp trong phim tiên hiệp
    for ch in "韩立马谷卜道友修仙元婴天劫":
        print(f"  {ch} → {table.get(ch, '(trống)')}")


if __name__ == "__main__":
    main()
