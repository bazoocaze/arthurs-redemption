// Câmera 2D: pan e zoom sobre o plano de mundo (pixels de mundo a zoom 1).
import { CAM, WORLD_W, WORLD_H } from './config.js';

const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

export class Camera {
  constructor(viewW = 1, viewH = 1) {
    this.viewW = viewW;
    this.viewH = viewH;
    this.zoom = CAM.initialZoom;
    this.x = 0; // mundo visível: canto superior esquerdo
    this.y = 0;
    this.centerOn(WORLD_W / 2, WORLD_H / 2);
  }

  setViewport(w, h) {
    this.viewW = Math.max(1, w);
    this.viewH = Math.max(1, h);
    this.clampPosition();
  }

  get scale() {
    return this.zoom;
  }

  worldToScreenX(wx) {
    return (wx - this.x) * this.zoom;
  }

  worldToScreenY(wy) {
    return (wy - this.y) * this.zoom;
  }

  screenToWorld(sx, sy) {
    return { x: sx / this.zoom + this.x, y: sy / this.zoom + this.y };
  }

  /** Arrasta o conteúdo: mover o dedo/mouse em (dx,dy) pixels de tela. */
  panByScreen(dx, dy) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.clampPosition();
  }

  /** Zoom ancorado em um ponto da tela (o ponto sob o cursor não se move). */
  zoomAt(sx, sy, factor) {
    const before = this.screenToWorld(sx, sy);
    this.zoom = clamp(this.zoom * factor, CAM.minZoom, CAM.maxZoom);
    this.x = before.x - sx / this.zoom;
    this.y = before.y - sy / this.zoom;
    this.clampPosition();
  }

  centerOn(wx, wy) {
    this.x = wx - this.viewW / (2 * this.zoom);
    this.y = wy - this.viewH / (2 * this.zoom);
    this.clampPosition();
  }

  /** Enquadra o mundo inteiro (usado no boot). */
  fitWorld() {
    const fit = Math.min(this.viewW / WORLD_W, this.viewH / WORLD_H) * 0.96;
    this.zoom = clamp(fit, CAM.minZoom, CAM.maxZoom);
    this.centerOn(WORLD_W / 2, WORLD_H / 2);
  }

  clampPosition() {
    const pad = CAM.edgePad;
    const viewW = this.viewW / this.zoom;
    const viewH = this.viewH / this.zoom;

    if (viewW >= WORLD_W + pad * 2) this.x = (WORLD_W - viewW) / 2;
    else this.x = clamp(this.x, -pad, WORLD_W - viewW + pad);

    if (viewH >= WORLD_H + pad * 2) this.y = (WORLD_H - viewH) / 2;
    else this.y = clamp(this.y, -pad, WORLD_H - viewH + pad);
  }

  /** Assinatura barata para detectar mudança de câmera (dirty flag de frame). */
  signature() {
    return `${this.x.toFixed(1)}|${this.y.toFixed(1)}|${this.zoom.toFixed(4)}|${this.viewW}|${this.viewH}`;
  }
}
