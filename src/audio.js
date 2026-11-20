// Áudio procedural (WebAudio, zero arquivos).
//
// Três restrições moldaram este módulo:
//
// 1. **Autoplay policy**: o contexto só pode nascer de um gesto do usuário.
//    `unlock()` é chamado no primeiro pointerdown/keydown; antes disso todo
//    play() é no-op silencioso.
// 2. **Eventos em rajada**: um spray de raio 4 molha 49 tiles e empurra 49
//    eventos no mesmo frame. Tocar 49 splashes é ruído branco saturado, então
//    cada som tem throttle e existe um teto global de vozes.
// 3. **Fogo é ambiente, não evento**: o crepitar vem de uma cama de ruído
//    filtrado com ganho proporcional à área queimando, mais estalos sorteados.
//    Sem isso seria um som por foco — 100 osciladores é pior que silêncio.
//
// Tudo é sintetizado: nenhum asset, nenhum download, funciona offline (M7).

const MASTER = 0.5;
const MAX_VOICES = 14;

/** Intervalo mínimo entre sons iguais (ms). Rajada vira um som só. */
const THROTTLE = {
  spray: 70,
  plant: 55,
  ignite: 90,
  ash: 400,
  extinguish: 120,
  explosion: 120,
};

export function createAudio() {
  let ctx = null;
  let master = null;
  let noise = null;
  let bed = null; // { source, gain, filtro }
  let muted = lerMudoSalvo();
  let vozes = 0;
  const ultimo = Object.create(null);
  const assobiando = new WeakSet();
  let acumuladorEstalo = 0;

  function lerMudoSalvo() {
    try {
      return localStorage.getItem('ar.mudo') === '1';
    } catch {
      return false;
    }
  }

  function salvarMudo() {
    try {
      localStorage.setItem('ar.mudo', muted ? '1' : '0');
    } catch {
      /* modo privado: só ignora */
    }
  }

  /** Cria o contexto. Só funciona dentro de um gesto do usuário. */
  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER;
      master.connect(ctx.destination);

      // 1 s de ruído branco reaproveitado por todos os sons.
      const len = Math.floor(ctx.sampleRate);
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const dados = noise.getChannelData(0);
      for (let i = 0; i < len; i++) dados[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
  }

  function pronto(tipo) {
    if (!ctx || muted) return false;
    if (vozes >= MAX_VOICES) return false;
    const agora = ctx.currentTime * 1000;
    const min = THROTTLE[tipo] || 0;
    if (ultimo[tipo] && agora - ultimo[tipo] < min) return false;
    ultimo[tipo] = agora;
    return true;
  }

  /** Cadeia de saída com pan opcional (esquerda/direita na tela). */
  function saida(pan) {
    if (!pan) return master;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(master);
    return p;
  }

  /** Fonte de ruído descartável (usa o buffer compartilhado). */
  function ruido(destino, dur) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.connect(destino);
    const t = ctx.currentTime;
    src.start(t, Math.random() * 0.9);
    src.stop(t + dur + 0.02);
    vozes++;
    setTimeout(() => { vozes--; }, (dur + 0.1) * 1000);
    return src;
  }

  /** Envelope de ganho simples: ataque rápido, decaimento exponencial. */
  function env(destino, pico, dur, ataque = 0.006) {
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, pico), t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(destino);
    return g;
  }

  function filtro(tipo, freq, q, destino) {
    const f = ctx.createBiquadFilter();
    f.type = tipo;
    f.frequency.value = freq;
    if (q) f.Q.value = q;
    f.connect(destino);
    return f;
  }

  // ---------------------------------------------------------------- explosão
  function explosao(pan) {
    if (!pronto('explosion')) return;
    const out = saida(pan);
    const dur = 0.85;

    // corpo: ruído que desce de 1200 Hz para 90 Hz
    const g = env(out, 0.9, dur, 0.004);
    const lp = filtro('lowpass', 1200, 0.9, g);
    lp.frequency.setValueAtTime(1200, ctx.currentTime);
    lp.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + dur * 0.8);
    ruido(lp, dur);

    // thump: senoide grave que cai, dá o "peso" que o ruído não dá
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(32, ctx.currentTime + 0.4);
    const g2 = env(out, 0.55, 0.45, 0.008);
    osc.connect(g2);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  }

  // ------------------------------------------------------------------- água
  function splash(pan, forca = 1) {
    if (!pronto(forca > 1 ? 'extinguish' : 'spray')) return;
    const out = saida(pan);
    const dur = forca > 1 ? 0.42 : 0.14;
    const g = env(out, 0.16 * forca, dur, 0.004);
    const bp = filtro('bandpass', 1500, 1.1, g);
    bp.frequency.setValueAtTime(2100, ctx.currentTime);
    bp.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + dur);
    ruido(bp, dur);

    // gotas: 2 impulsos curtos e agudos
    if (forca > 1) {
      for (let k = 0; k < 2; k++) {
        const t0 = ctx.currentTime + 0.05 + k * 0.06;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(900 + k * 420, t0);
        o.frequency.exponentialRampToValueAtTime(1500 + k * 500, t0 + 0.05);
        const gg = ctx.createGain();
        gg.gain.setValueAtTime(0.0001, t0);
        gg.gain.exponentialRampToValueAtTime(0.06, t0 + 0.005);
        gg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
        o.connect(gg);
        gg.connect(out);
        o.start(t0);
        o.stop(t0 + 0.08);
      }
    }
  }

  // --------------------------------------------------------------- plantar
  function plantar(pan) {
    if (!pronto('plant')) return;
    const out = saida(pan);
    // duas oscilações curtas = toque de madeira, não "bipe"
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(300, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(170, ctx.currentTime + 0.07);
    const g = env(out, 0.09, 0.1, 0.003);
    o.connect(g);
    o.start();
    o.stop(ctx.currentTime + 0.12);
  }

  // ----------------------------------------------------------------- fogo
  function acender(pan) {
    if (!pronto('ignite')) return;
    const out = saida(pan);
    const g = env(out, 0.13, 0.34, 0.02);
    const bp = filtro('bandpass', 380, 0.8, g);
    bp.frequency.setValueAtTime(300, ctx.currentTime);
    bp.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.3);
    ruido(bp, 0.34);
  }

  /** Cama contínua de fogo. Criada uma vez, ganho segue a área queimando. */
  function garantirCama() {
    if (bed || !ctx) return;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(master);

    const bp = filtro('bandpass', 520, 0.6, g);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.connect(bp);
    src.start();

    // camada de chiado: dá o "crepitar" sem precisar de estalo por foco
    const g2 = ctx.createGain();
    g2.gain.value = 0;
    g2.connect(master);
    const hp = filtro('highpass', 2600, 0.7, g2);
    const src2 = ctx.createBufferSource();
    src2.buffer = noise;
    src2.loop = true;
    src2.connect(hp);
    src2.start();

    bed = { ganho: g, chiado: g2 };
  }

  /** Estalo curto: o "toc" da lenha. */
  function estalo() {
    if (!ctx || muted || vozes >= MAX_VOICES) return;
    const g = env(master, 0.09 + Math.random() * 0.11, 0.03, 0.002);
    const bp = filtro('bandpass', 1400 + Math.random() * 1800, 2.4, g);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.connect(bp);
    const t = ctx.currentTime;
    src.start(t, Math.random() * 0.9);
    src.stop(t + 0.05);
  }

  // -------------------------------------------------------- assovio da bomba
  /** Assovio descendente durante a queda: o único aviso sonoro de que vem bomba. */
  function assovio(bomba) {
    if (!ctx || muted || assobiando.has(bomba)) return;
    assobiando.add(bomba);
    const dur = Math.max(0.15, bomba.dur - bomba.t);
    const out = saida(0);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(980, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(240, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(out);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  /** Chamado a cada frame pelo loop principal. */
  function update(dt, burning, bombs) {
    if (!ctx || muted) return;
    garantirCama();

    // cama: ganho proporcional ao fogo, com histerese suave
    const alvo = Math.min(0.14, burning * 0.006);
    const t = ctx.currentTime;
    bed.ganho.gain.setTargetAtTime(alvo, t, 0.25);
    bed.chiado.gain.setTargetAtTime(alvo * 0.35, t, 0.3);

    // estalos: densidade acompanha o fogo, teto de 14/s
    if (burning > 0) {
      acumuladorEstalo += dt * Math.min(14, burning * 0.55);
      while (acumuladorEstalo >= 1) {
        acumuladorEstalo -= 1;
        estalo();
      }
    } else {
      acumuladorEstalo = 0;
    }

    // assovio das bombas em queda
    if (bombs) {
      for (let k = 0; k < bombs.inFlight.length; k++) {
        const b = bombs.inFlight[k];
        if (b.delay <= 0) assovio(b);
      }
    }
  }

  function play(tipo, pan = 0) {
    if (!ctx || muted) return;
    if (tipo === 'explosion') explosao(pan);
    else if (tipo === 'spray') splash(pan, 1);
    else if (tipo === 'extinguish') splash(pan, 1.8);
    else if (tipo === 'ignite') acender(pan);
    else if (tipo === 'plant') plantar(pan);
    // 'ash' é silencioso de propósito: cinza não pede atenção
  }

  /**
   * Aba escondida/jogo pausado: suspende o contexto inteiro. Só zerar a cama
   * de fogo não bastaria — um estalo ou assovio agendado ainda tocaria.
   */
  function suspender() {
    if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
  }

  /** Volta do pause; se o jogador está no mudo, o master já está em 0. */
  function retomar() {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function toggleMute() {
    muted = !muted;
    salvarMudo();
    if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.05);
    return muted;
  }

  return {
    unlock,
    play,
    update,
    toggleMute,
    suspender,
    retomar,
    // Expostos só para o probe medir sinal (RMS). Não usar no jogo.
    get debugCtx() { return ctx; },
    get debugMaster() { return master; },
    get muted() { return muted; },
    get ativo() { return !!ctx; },
    get vozes() { return vozes; },
  };
}
