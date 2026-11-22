# 한판 오락실 3D 소품 묶음 만들기 (Blender 5.x)
#   "C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" -b -P tools/blender/make_kit.py -- [미리보기.png]
# 결과: public/models/kit.glb  (떡 캐릭터, 화분, 벤치, 물탱크, 옥탑, 실외기, 파라솔, 건물, 볼링핀, 라켓 …)
# 색은 전부 재질 색(텍스처 없음)이라 파일이 작다. 캐릭터 몸 색은 게임에서 재질 "body"/"dark" 를 갈아 끼운다.
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix, Euler

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "public", "models", "kit.glb")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
PREVIEW = argv[0] if argv else None
random.seed(7)

bpy.ops.wm.read_factory_settings(use_empty=True)

def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def rgb(hexs):
    h = hexs.lstrip("#")
    return tuple(lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))

MATS = {}
def M(name, color=None, rough=0.7, emit=None, strength=1.0, metal=0.0, alpha=1.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb(color), 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*rgb(emit), 1)
        b.inputs["Emission Strength"].default_value = strength
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
        m.blend_method = "BLEND" if hasattr(m, "blend_method") else m.blend_method
    MATS[name] = m
    return m

class Asset:
    """부품을 하나의 메쉬로 모아 담는다 (재질은 면마다)."""
    def __init__(self, name):
        self.name, self.bm, self.slots = name, bmesh.new(), []
    def slot(self, mat):
        if mat not in self.slots:
            self.slots.append(mat)
        return self.slots.index(mat)
    def add(self, tb, mat, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), smooth=True):
        mx = Matrix.Translation(Vector(loc)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1))
        tb.transform(mx)
        i = self.slot(mat)
        for f in tb.faces:
            f.material_index = i
            f.smooth = smooth
        bmesh.ops.recalc_face_normals(tb, faces=tb.faces)
        tmp = bpy.data.meshes.new("tmp")
        tb.to_mesh(tmp); tb.free()
        self.bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    # ── 기본 모양 ──
    def sphere(self, mat, r=1, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), seg=24, rings=14, fn=None):
        tb = bmesh.new(); bmesh.ops.create_uvsphere(tb, u_segments=seg, v_segments=rings, radius=r)
        if fn:
            for v in tb.verts: v.co = fn(v.co.copy())
        self.add(tb, mat, loc, rot, scale)
    def ico(self, mat, r=1, loc=(0, 0, 0), scale=(1, 1, 1), sub=2, jitter=0.0, smooth=False):
        tb = bmesh.new(); bmesh.ops.create_icosphere(tb, subdivisions=sub, radius=r)
        if jitter:
            for v in tb.verts: v.co *= 1 + (random.random() - 0.5) * jitter
        self.add(tb, mat, loc, (random.random() * 6, random.random() * 6, 0), scale, smooth)
    def cyl(self, mat, r1=1, r2=None, h=1, loc=(0, 0, 0), rot=(0, 0, 0), seg=20, caps=True, scale=(1, 1, 1)):
        tb = bmesh.new(); bmesh.ops.create_cone(tb, cap_ends=caps, cap_tris=False, segments=seg, radius1=r1, radius2=r1 if r2 is None else r2, depth=h)
        self.add(tb, mat, loc, rot, scale)
    def box(self, mat, size=(1, 1, 1), loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.03, seg=2):
        tb = bmesh.new(); bmesh.ops.create_cube(tb, size=1)
        for v in tb.verts: v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        b = min(bevel, min(size) * 0.45)
        if b > 0:
            bmesh.ops.bevel(tb, geom=list(tb.edges), offset=b, segments=seg, affect="EDGES", profile=0.5)
        self.add(tb, mat, loc, rot, smooth=b > 0)
    def torus(self, mat, R=1, r=0.1, loc=(0, 0, 0), rot=(0, 0, 0), seg=28, tube=8, arc=math.tau, scale=(1, 1, 1), start=0.0):
        tb = bmesh.new()
        n = seg if arc >= math.tau - 1e-6 else seg + 1
        rings = []
        for i in range(n):
            a = start + arc * i / seg
            c = Vector((math.cos(a) * R, math.sin(a) * R, 0)); d = Vector((math.cos(a), math.sin(a), 0))
            rings.append([tb.verts.new(c + d * math.cos(t * math.tau / tube) * r + Vector((0, 0, math.sin(t * math.tau / tube) * r))) for t in range(tube)])
        cnt = seg if arc >= math.tau - 1e-6 else seg
        for i in range(cnt):
            a, b = rings[i], rings[(i + 1) % n]
            for t in range(tube):
                tb.faces.new((a[t], b[t], b[(t + 1) % tube], a[(t + 1) % tube]))
        if arc < math.tau - 1e-6:
            tb.faces.new(rings[0]); tb.faces.new(list(reversed(rings[-1])))
        self.add(tb, mat, loc, rot, scale)
    def lathe(self, mat, profile, loc=(0, 0, 0), seg=24, bands=None, scale=(1, 1, 1)):
        """profile: [(반지름, 높이), …] 아래에서 위로. bands: [(z0, z1, 재질)] 이 높이의 면은 다른 재질."""
        tb = bmesh.new(); rings = []
        for (r, z) in profile:
            rings.append([tb.verts.new((math.cos(k * math.tau / seg) * r, math.sin(k * math.tau / seg) * r, z)) for k in range(seg)])
        faces = []
        for i in range(len(rings) - 1):
            for k in range(seg):
                faces.append((tb.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k])), (profile[i][1] + profile[i + 1][1]) / 2))
        if profile[0][0] > 1e-5: tb.faces.new(list(reversed(rings[0])))
        if profile[-1][0] > 1e-5: tb.faces.new(rings[-1])
        bmesh.ops.remove_doubles(tb, verts=tb.verts, dist=1e-5)
        tag = {}
        if bands:
            for f, z in faces:
                for (z0, z1, bm_) in bands:
                    if z0 <= z <= z1 and f.is_valid: tag[f.index] = bm_
        tb.faces.index_update()
        mx = Matrix.Translation(Vector(loc)) @ Matrix.Diagonal((*scale, 1))
        tb.transform(mx)
        base = self.slot(mat)
        if bands:
            zs = {id(f): z for f, z in faces if f.is_valid}
        for f in tb.faces:
            f.smooth = True; f.material_index = base
        if bands:
            for f, z in faces:
                if not f.is_valid: continue
                for (z0, z1, bm_) in bands:
                    if z0 <= z <= z1: f.material_index = self.slot(bm_)
        bmesh.ops.recalc_face_normals(tb, faces=tb.faces)
        tmp = bpy.data.meshes.new("tmp"); tb.to_mesh(tmp); tb.free(); self.bm.from_mesh(tmp); bpy.data.meshes.remove(tmp)
    def done(self, split=38):
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me); self.bm.free()
        for m in self.slots: me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        es = ob.modifiers.new("split", "EDGE_SPLIT"); es.split_angle = math.radians(split)
        return ob

# ── 공통 재질 ──
BODY = M("body", "#ff9db5", 0.5)
DARK = M("dark", "#d6688a", 0.6)
INK = M("ink", "#2b2d4e", 0.25)
WHITE = M("white", "#ffffff", 0.3, emit="#ffffff", strength=0.6)
BLUSH = M("blush", "#ff7f9c", 0.8)
POT = M("pot", "#c9653e", 0.75); POT2 = M("pot2", "#a94f2e", 0.8); SOIL = M("soil", "#5a3a2a", 1)
G1 = M("leaf1", "#5fae5a", 0.8); G2 = M("leaf2", "#3f8f5a", 0.8); G3 = M("leaf3", "#86c56a", 0.8)
WOOD = M("wood", "#b07a4e", 0.7); WOOD2 = M("wood2", "#8f5f3a", 0.75)
STEEL = M("steel", "#39406e", 0.45, metal=0.3); METAL = M("metal", "#c9ced8", 0.4, metal=0.5)
CREAM = M("cream", "#f3d6ae", 0.85); CREAM2 = M("cream2", "#e3bf93", 0.85)
TEAL = M("teal", "#3f8f86", 0.6); CORAL = M("coral", "#ff5d73", 0.55); YELL = M("yellow", "#ffc93c", 0.55)
GLASS = M("glass", "#bfe6ff", 0.15, emit="#ffe9a8", strength=1.2)
LAMP = M("lamp", "#fff2b8", 0.4, emit="#ffe9a8", strength=4)
ROOFB = M("roofblue", "#7b8fc0", 0.6); TANKC = M("tank", "#e9d6b4", 0.6)
ACW = M("acwhite", "#e7e3da", 0.5); ACD = M("acdark", "#6f7690", 0.5)

# ── 떡 캐릭터 (발밑이 원점, 얼굴은 -Y = 게임의 +Z) ──
def mochi():
    a = Asset("mochi")
    def pear(v):      # 아래가 살짝 퍼지고 바닥이 눌린 떡 모양
        t = min(1, max(0, (v.z + 0.66) / 1.32))
        k = 1 + 0.1 * (1 - t) ** 1.5 - 0.03 * t
        z = v.z if v.z > -0.5 else -0.5 + (v.z + 0.5) * 0.45
        return Vector((v.x * k, v.y * k, z))
    a.sphere(BODY, 0.66, (0, 0, 0.64), (1, 1, 0.92), seg=32, rings=20, fn=pear)
    for e in (-1, 1):
        a.sphere(INK, 0.085, (e * 0.21, -0.585, 0.78), (1, 0.75, 1.12), seg=14, rings=10)
        a.sphere(WHITE, 0.03, (e * 0.21 + 0.03, -0.645, 0.815), seg=8, rings=6)
        a.sphere(WHITE, 0.014, (e * 0.21 - 0.03, -0.652, 0.765), seg=6, rings=4)
        a.sphere(BLUSH, 0.105, (e * 0.385, -0.5, 0.63), (1, 0.35, 0.68), rot=(0, 0, e * 0.6), seg=12, rings=8)
        a.sphere(DARK, 0.155, (e * 0.27, -0.07, 0.085), (1, 1.25, 0.6), seg=14, rings=8)      # 발
        a.sphere(BODY, 0.12, (e * 0.66, -0.1, 0.56), (0.75, 0.9, 1.1), rot=(0, e * 0.5, 0), seg=12, rings=8)      # 손
    a.torus(INK, 0.08, 0.02, (0, -0.655, 0.7), rot=(math.pi / 2, 0, 0), seg=10, tube=6, arc=math.radians(130), start=math.radians(205))      # 웃는 입
    # 머리 위 새싹
    a.cyl(G2, 0.022, 0.016, 0.16, (0, 0, 1.3), rot=(0.25, 0, 0), seg=8)
    a.sphere(G1, 0.1, (0.075, 0.03, 1.4), (1, 0.55, 0.3), rot=(0, 0.5, 0.3), seg=10, rings=6)
    a.sphere(G3, 0.085, (-0.07, 0.04, 1.38), (1, 0.55, 0.3), rot=(0, -0.6, -0.4), seg=10, rings=6)
    return a.done(60)

def cap():
    a = Asset("cap")
    tb = bmesh.new(); bmesh.ops.create_uvsphere(tb, u_segments=24, v_segments=12, radius=0.62)
    bmesh.ops.delete(tb, geom=[v for v in tb.verts if v.co.z < -0.02], context="VERTS")
    a.add(tb, DARK, (0, 0, 0.9), scale=(1, 1, 0.62))
    a.cyl(DARK, 0.4, 0.4, 0.045, (0, -0.52, 0.925), seg=20, scale=(0.9, 0.75, 1))      # 챙
    a.sphere(WHITE, 0.06, (0, 0, 1.29), (1, 1, 0.6), seg=10, rings=6)
    return a.done(50)

def racket():
    a = Asset("racket")      # 손잡이 아래가 원점, 위(+Z)로 뻗는다
    a.cyl(STEEL, 0.045, 0.04, 0.5, (0, 0, 0.25), seg=10)
    a.cyl(M("grip", "#fff8ea", 0.8), 0.052, 0.052, 0.2, (0, 0, 0.1), seg=10)
    a.torus(CORAL, 0.3, 0.04, (0, 0, 0.84), rot=(math.pi / 2, 0, 0), seg=26, tube=8, scale=(1, 1, 1.2))
    st = M("string", "#fffdf6", 0.6)
    for k in range(-2, 3):
        w = math.sqrt(max(0.01, 1 - (k * 0.1 / 0.3) ** 2))
        a.box(st, (0.012, 0.012, 0.68 * w), (k * 0.1, 0, 0.84), bevel=0)
        a.box(st, (0.56 * w, 0.012, 0.012), (0, 0, 0.84 + k * 0.12), bevel=0)
    return a.done(40)

def pot(a, r=0.38, h=0.5, mat=POT):
    a.lathe(mat, [(r * 0.62, 0), (r * 0.72, 0.02), (r * 0.95, h * 0.82), (r * 1.08, h * 0.84), (r * 1.08, h), (r * 0.92, h), (r * 0.9, h * 0.9)], seg=18, bands=[(h * 0.8, h * 1.01, POT2)])
    a.cyl(SOIL, r * 0.9, r * 0.9, 0.02, (0, 0, h * 0.9), seg=18)

def plant_bush():
    a = Asset("plant_a"); pot(a)
    for i in range(9):
        ang, rr = random.random() * 6.28, random.random() * 0.3
        a.ico([G1, G2, G3][i % 3], 0.24 + random.random() * 0.14, (math.cos(ang) * rr, math.sin(ang) * rr, 0.72 + random.random() * 0.5), sub=2, jitter=0.18, smooth=True)
    return a.done(70)

def plant_blades():
    a = Asset("plant_b"); pot(a, 0.34, 0.46, M("pot_blue", "#5b7bb8", 0.6))
    for i in range(11):
        ang = i * 2.4; tilt = 0.12 + (i % 4) * 0.11; ln = 0.75 + random.random() * 0.55
        tb = bmesh.new(); bmesh.ops.create_cone(tb, cap_ends=True, segments=6, radius1=0.085, radius2=0.012, depth=ln)
        for v in tb.verts:
            t = (v.co.z + ln / 2) / ln
            v.co.x *= 1.5; v.co.y *= 0.35; v.co.y += 0.22 * t * t; v.co.z += ln / 2
        a.add(tb, [G2, G1, G3][i % 3], (math.cos(ang) * 0.08, math.sin(ang) * 0.08, 0.4), (tilt * math.sin(ang), -tilt * math.cos(ang), ang + 1.57))
    return a.done(60)

def plant_flower():
    a = Asset("plant_c"); pot(a, 0.42, 0.42, M("pot_cream", "#f3e2c4", 0.7))
    for i in range(7):
        ang, rr = i * 0.9, 0.12 + random.random() * 0.2
        a.ico([G2, G1][i % 2], 0.22 + random.random() * 0.1, (math.cos(ang) * rr, math.sin(ang) * rr, 0.6 + random.random() * 0.25), sub=2, jitter=0.15, smooth=True)
    cols = [M("fl1", "#ff8fa3", 0.6), M("fl2", "#ffd66b", 0.6), M("fl3", "#ffffff", 0.6)]
    for i in range(12):
        ang, rr, z = random.random() * 6.28, 0.1 + random.random() * 0.3, 0.78 + random.random() * 0.25
        p = (math.cos(ang) * rr, math.sin(ang) * rr, z)
        for k in range(5):
            a.sphere(cols[i % 3], 0.045, (p[0] + math.cos(k * 1.256) * 0.045, p[1] + math.sin(k * 1.256) * 0.045, p[2]), (1, 1, 0.5), seg=8, rings=5)
        a.sphere(YELL if i % 3 else CORAL, 0.03, (p[0], p[1], p[2] + 0.015), seg=8, rings=5)
    return a.done(70)

def bench():
    a = Asset("bench")      # 길이 3 (x), 앉는 높이 0.45, 등받이는 +Y(게임의 -Z, 뒤쪽)
    for y in (-0.2, 0, 0.2):
        a.box(WOOD, (3, 0.17, 0.06), (0, y, 0.45), bevel=0.02)
    for z in (0.72, 0.95):
        a.box(WOOD2, (3, 0.05, 0.17), (0, 0.33, z), rot=(-0.12, 0, 0), bevel=0.02)
    for x in (-1.25, 1.25):
        a.box(STEEL, (0.07, 0.6, 0.06), (x, 0.02, 0.4), bevel=0.01)
        a.box(STEEL, (0.07, 0.06, 0.42), (x, -0.25, 0.2), bevel=0.01)
        a.box(STEEL, (0.07, 0.06, 1.05), (x, 0.3, 0.52), rot=(-0.12, 0, 0), bevel=0.01)
    return a.done()

def tank():
    a = Asset("tank")
    for (x, y) in ((-0.85, -0.85), (0.85, -0.85), (-0.85, 0.85), (0.85, 0.85)):
        a.cyl(STEEL, 0.07, 0.07, 1.4, (x, y, 0.7), seg=8)
    for s in (-1, 1):
        a.box(STEEL, (1.9, 0.06, 0.06), (0, s * 0.85, 0.7), rot=(0, 0.5 * s, 0), bevel=0)
        a.box(STEEL, (0.06, 1.9, 0.06), (s * 0.85, 0, 0.7), rot=(0.5 * s, 0, 0), bevel=0)
    a.cyl(WOOD2, 1.45, 1.45, 0.12, (0, 0, 1.44), seg=24)
    a.lathe(TANKC, [(1.3, 1.5), (1.36, 1.6), (1.36, 3.4), (1.3, 3.5)], seg=28)
    for z in (1.85, 2.5, 3.15):
        a.torus(STEEL, 1.37, 0.035, (0, 0, z), seg=28, tube=6)
    a.lathe(ROOFB, [(1.55, 3.48), (1.5, 3.56), (0.2, 4.25), (0.0, 4.3)], seg=28)
    a.sphere(YELL, 0.12, (0, 0, 4.36), seg=10, rings=6)
    for x in (-0.18, 0.18):
        a.box(METAL, (0.04, 0.04, 3.3), (x, -1.42, 1.75), bevel=0)
    for i in range(10):
        a.box(METAL, (0.36, 0.035, 0.035), (0, -1.42, 0.3 + i * 0.33), bevel=0)
    a.cyl(METAL, 0.07, 0.07, 1.5, (1.0, 0.9, 0.75), seg=8)
    return a.done()

def ac():
    a = Asset("ac")
    a.box(ACW, (1.4, 0.75, 0.95), (0, 0, 0.56), bevel=0.05)
    a.cyl(ACD, 0.36, 0.36, 0.05, (-0.22, -0.385, 0.56), rot=(math.pi / 2, 0, 0), seg=22)
    a.torus(METAL, 0.36, 0.025, (-0.22, -0.4, 0.56), rot=(math.pi / 2, 0, 0), seg=22, tube=6)
    for k in range(4):
        a.box(METAL, (0.66, 0.02, 0.08), (-0.22, -0.415, 0.56), rot=(0, k * 0.785, 0), bevel=0)
    for z in (0.3, 0.42, 0.54, 0.66, 0.78):
        a.box(ACD, (0.3, 0.02, 0.05), (0.42, -0.385, z), bevel=0)
    for x in (-0.5, 0.5):
        a.box(STEEL, (0.12, 0.7, 0.09), (x, 0, 0.045), bevel=0.01)
    return a.done()

def hut():
    a = Asset("hut")      # 옥탑(계단실). 문은 -Y 쪽
    a.box(CREAM, (4.2, 3, 2.8), (0, 0, 1.4), bevel=0.04)
    a.box(CREAM2, (4.7, 3.5, 0.22), (0, 0, 2.9), bevel=0.05)
    a.box(CREAM, (4.5, 3.3, 0.12), (0, 0, 3.05), bevel=0.03)
    a.box(TEAL, (1.05, 0.1, 1.95), (-0.95, -1.5, 0.98), bevel=0.03)
    a.box(M("teal2", "#337a72", 0.6), (0.8, 0.04, 0.7), (-0.95, -1.56, 1.42), bevel=0.02)
    a.sphere(YELL, 0.06, (-0.6, -1.58, 0.95), seg=8, rings=6)
    a.box(WOOD2, (1.3, 0.14, 1.0), (0.95, -1.5, 1.65), bevel=0.03)
    a.box(GLASS, (1.08, 0.06, 0.78), (0.95, -1.56, 1.65), bevel=0.01)
    a.box(WOOD2, (0.05, 0.08, 0.78), (0.95, -1.58, 1.65), bevel=0); a.box(WOOD2, (1.08, 0.08, 0.05), (0.95, -1.58, 1.65), bevel=0)
    # 줄무늬 차양
    for k in range(6):
        a.box(CORAL if k % 2 else M("awn", "#fff8ea", 0.8), (0.25, 0.75, 0.05), (-1.575 + k * 0.25, -1.82, 2.12), rot=(0.42, 0, 0), bevel=0)
    a.sphere(LAMP, 0.1, (0.05, -1.58, 2.25), seg=10, rings=8); a.box(STEEL, (0.08, 0.14, 0.06), (0.05, -1.53, 2.36), bevel=0)
    a.cyl(METAL, 0.16, 0.16, 0.7, (1.5, 0.8, 3.4), seg=10); a.cyl(METAL, 0.24, 0.1, 0.16, (1.5, 0.8, 3.82), seg=10)
    a.box(WOOD, (1.2, 0.5, 0.05), (0.95, -1.75, 1.08), bevel=0.01)      # 창가 선반
    a.ico(G1, 0.16, (0.7, -1.78, 1.26), sub=1, jitter=0.2, smooth=True); a.ico(G3, 0.13, (1.2, -1.78, 1.24), sub=1, jitter=0.2, smooth=True)
    return a.done()

def parasol():
    a = Asset("parasol")
    a.cyl(STEEL, 0.05, 0.05, 2.7, (0, 0, 1.35), seg=8)
    a.cyl(WOOD, 0.75, 0.75, 0.07, (0, 0, 0.8), seg=22); a.cyl(STEEL, 0.3, 0.36, 0.06, (0, 0, 0.03), seg=14)
    tb = bmesh.new(); bmesh.ops.create_cone(tb, cap_ends=False, segments=8, radius1=1.7, radius2=0.04, depth=0.7)
    c1, c2 = a.slot(CORAL), a.slot(M("awn", "#fff8ea", 0.8))
    for i, f in enumerate(tb.faces):
        f.material_index = c1 if i % 2 else c2
        f.smooth = False
    tb.transform(Matrix.Translation((0, 0, 2.75)))
    tmp = bpy.data.meshes.new("tmp"); tb.to_mesh(tmp); tb.free(); a.bm.from_mesh(tmp); bpy.data.meshes.remove(tmp)
    a.sphere(YELL, 0.08, (0, 0, 3.14), seg=8, rings=6)
    for (x, y) in ((1.15, 0.2), (-0.9, 0.75), (-0.3, -1.15)):
        a.cyl(M("stool", "#7b8fc0", 0.6), 0.27, 0.27, 0.07, (x, y, 0.46), seg=14); a.cyl(STEEL, 0.035, 0.035, 0.44, (x, y, 0.22), seg=8)
    a.cyl(M("cup", "#fffdf6", 0.4), 0.07, 0.055, 0.14, (0.3, 0.2, 0.91), seg=10); a.cyl(YELL, 0.07, 0.055, 0.14, (-0.25, -0.2, 0.91), seg=10)
    return a.done()

def pole():
    a = Asset("pole")
    a.cyl(STEEL, 0.16, 0.2, 0.12, (0, 0, 0.06), seg=12); a.cyl(STEEL, 0.06, 0.05, 4.1, (0, 0, 2.05), seg=10); a.sphere(YELL, 0.1, (0, 0, 4.14), seg=10, rings=6)
    return a.done()

def crate():
    a = Asset("crate")
    a.box(WOOD, (0.9, 0.9, 0.9), (0, 0, 0.45), bevel=0.02)
    for s in (-1, 1):
        for ax in range(2):
            sz = (0.94, 0.08, 0.08) if ax == 0 else (0.08, 0.94, 0.08)
            for z in (0.06, 0.84):
                a.box(WOOD2, sz, ((0, s * 0.43, z) if ax == 0 else (s * 0.43, 0, z)), bevel=0.01)
        for s2 in (-1, 1):
            a.box(WOOD2, (0.08, 0.08, 0.9), (s * 0.43, s2 * 0.43, 0.45), bevel=0.01)
    return a.done()

def pin():
    a = Asset("pin")      # 높이 1, 바닥이 원점
    red = M("pinred", "#ff5d73", 0.4)
    a.lathe(M("pinwhite", "#fffdf6", 0.3), [(0.11, 0), (0.15, 0.03), (0.2, 0.2), (0.2, 0.36), (0.14, 0.56), (0.092, 0.655), (0.084, 0.695), (0.08, 0.725), (0.08, 0.765), (0.09, 0.8), (0.115, 0.86), (0.12, 0.93), (0.075, 0.99), (0.0, 1.0)], seg=20, bands=[(0.66, 0.69, red), (0.73, 0.76, red)])
    return a.done(60)

def building(name, w, d, h, wall, trim, floors, cols, lit=0.45):
    a = Asset(name)      # 바닥 가운데가 원점, 위로 h
    WALL, TRIM = M(name + "_wall", wall, 0.9), M(name + "_trim", trim, 0.85)
    ON = M("win_on", "#ffe9a8", 0.3, emit="#ffd98a", strength=2.2); OFF = M("win_off", "#5b5f8a", 0.3)
    a.box(WALL, (w, d, h), (0, 0, h / 2), bevel=0)
    a.box(TRIM, (w + 0.3, d + 0.3, 0.35), (0, 0, h - 0.1), bevel=0)
    a.box(TRIM, (w + 0.2, d + 0.2, 0.25), (0, 0, h * 0.5), bevel=0)
    fh = (h - 1.2) / floors
    for side in range(4):
        L = w if side % 2 == 0 else d
        cw = L / cols
        for f in range(floors):
            for c in range(cols):
                u = -L / 2 + (c + 0.5) * cw; z = 0.6 + (f + 0.5) * fh
                m = ON if random.random() < lit else OFF
                sz = (cw * 0.52, 0.06, fh * 0.56)
                if side == 0: a.box(m, sz, (u, -d / 2 - 0.01, z), bevel=0)
                elif side == 2: a.box(m, sz, (u, d / 2 + 0.01, z), bevel=0)
                elif side == 1: a.box(m, (0.06, sz[0], sz[2]), (w / 2 + 0.01, u, z), bevel=0)
                else: a.box(m, (0.06, sz[0], sz[2]), (-w / 2 - 0.01, u, z), bevel=0)
    # 옥상 살림
    a.cyl(TANKC, 0.7, 0.7, 1.1, (w * 0.22, d * 0.15, h + 0.75), seg=12); a.cyl(ROOFB, 0.8, 0.05, 0.4, (w * 0.22, d * 0.15, h + 1.5), seg=12)
    a.box(TRIM, (w * 0.3, d * 0.3, 1.0), (-w * 0.2, -d * 0.1, h + 0.5), bevel=0)
    a.cyl(STEEL, 0.04, 0.04, 2.2, (-w * 0.3, d * 0.3, h + 1.1), seg=6)
    return a.done()

objs = [mochi(), cap(), racket(), plant_bush(), plant_blades(), plant_flower(), bench(), tank(), ac(), hut(), parasol(), pole(), crate(), pin(),
        building("bldg_a", 7, 6, 22, "#eeb690", "#d99a78", 9, 4, 0.5),
        building("bldg_b", 9, 7, 15, "#dc9c88", "#c07f70", 6, 5, 0.4),
        building("bldg_c", 6, 6, 30, "#c98d95", "#a96f7c", 12, 3, 0.55),
        building("bldg_d", 11, 8, 11, "#f3cba2", "#dba97c", 4, 6, 0.35)]

tris = 0
for o in objs:
    o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)
print("KIT objects", len(objs), "triangles", tris)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True, export_yup=True, export_texcoords=False, export_cameras=False, export_lights=False, export_animations=False)
print("WROTE", OUT, os.path.getsize(OUT) // 1024, "KB")

# ── 미리보기 그림 ──
if PREVIEW:
    x = -13
    for o in objs:
        wdt = max(o.dimensions.x, 1.2)
        big = o.name.startswith("bldg")
        s = 0.2 if big else (2.2 if o.name in ("mochi", "cap", "racket", "pin") else 1)
        if big and x < 100: x = 100 - 13
        o.scale = (s, s, s); x += wdt * s / 2; o.location = ((x - 100) if big else x, 14 if big else 0, 0); x += wdt * s / 2 + 0.7
    x = 13
    sc = bpy.context.scene
    bpy.ops.mesh.primitive_plane_add(size=120, location=(0, 0, 0)); bpy.context.object.data.materials.append(M("floor", "#dcb692", 0.9))
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 4; sun.data.color = (1, 0.82, 0.62); sun.rotation_euler = (math.radians(58), 0, math.radians(-40)); sc.collection.objects.link(sun)
    w = bpy.data.worlds.new("w"); w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.6, 0.55, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.9; sc.world = w
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); cam.data.lens = 40; sc.collection.objects.link(cam); sc.camera = cam
    cam.location = (-1, -27, 9); cam.rotation_euler = (math.radians(74), 0, 0)
    sc.render.resolution_x, sc.render.resolution_y = 1700, 800
    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "BLENDER_WORKBENCH"):
        try:
            sc.render.engine = eng; break
        except Exception:
            pass
    sc.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    print("PREVIEW", PREVIEW, sc.render.engine)
