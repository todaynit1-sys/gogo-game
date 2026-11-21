// 3D 무대 파일을 필요할 때만 불러오는 도우미. 못 불러오면(또는 3D 가 안 되는 기기면) 게임은 원래 2D 그림으로 그린다.
export function lazy3d(url) {
  let mod = null, on = false, err = false;
  return {
    get() {
      if (!mod && !on && !err && typeof document !== "undefined") { on = true; import(url).then((m) => { mod = m; }).catch(() => { err = true; }); }
      return err ? null : mod;
    },
    fail() { err = true; try { if (mod && mod.dispose) mod.dispose(); } catch {} },
    dispose() { try { if (mod && mod.dispose) mod.dispose(); } catch {} },
  };
}
