// The DOM HUD: health, ammo, timer, score, money, kill feed, bomb status, the buy
// menu and the overlays. It never touches the simulation; main.js pushes numbers in
// and reads the play and buy callbacks out. Every panel is a light frosted card —
// #F5F5F7, white, one #007AFF accent — so the interface reads over the dusk yard.
export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayCopy = $('overlay-copy');
  const playButton = $('play');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const damage = $('damage');
  const healthValue = $('health-value');
  const healthBar = $('health-bar');
  const armorValue = $('armor-value');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const grenadeCounts = $('grenade-counts');
  const timerValue = $('timer-value');
  const scoreSable = $('score-sable');
  const scoreRust = $('score-rust');
  const roundValue = $('round-value');
  const aliveSable = $('alive-sable');
  const aliveRust = $('alive-rust');
  const moneyValue = $('money-value');
  const killfeed = $('killfeed');
  const bombChip = $('bomb-chip');
  const buyMenu = $('buy-menu');
  const buyItems = $('buy-items');
  const buyMoney = $('buy-money');
  const buyClose = $('buy-close');

  let hitTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastWeapon = '';
  let lastHealth = -1;
  let lastArmor = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastMoney = -1;
  let lastFeed = '';
  let bannerTimer = 0;

  function pips(element, alive, total) {
    let html = '';
    for (let i = 0; i < total; i += 1) html += `<i class="${i < alive ? 'on' : ''}"></i>`;
    element.innerHTML = html;
  }

  return {
    setHealth(health, armor) {
      if (health === lastHealth && armor === lastArmor) return;
      lastHealth = health;
      lastArmor = armor;
      healthValue.textContent = String(Math.ceil(health));
      healthBar.style.width = `${Math.max(0, health)}%`;
      healthBar.classList.toggle('low', health <= 30);
      armorValue.textContent = armor > 0 ? `Armor ${Math.ceil(armor)}` : '';
    },
    setAmmo(mag, reserve, name, reloading) {
      if (mag === lastMag && reserve === lastReserve && name === lastWeapon) return;
      lastMag = mag;
      lastReserve = reserve;
      lastWeapon = name;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = reloading ? `${name} — reloading` : name;
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setGrenades(frag, smoke) {
      grenadeCounts.textContent = `Frag ${frag} · Smoke ${smoke}`;
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value.toLocaleString('en-US')}`;
      buyMoney.textContent = `$${value.toLocaleString('en-US')}`;
    },
    setTimer(seconds, phase) {
      const text = phase === 'freeze' ? `Buy ${Math.ceil(seconds)}` : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
      if (text === lastTimer) return;
      lastTimer = text;
      timerValue.textContent = text;
      timerValue.classList.toggle('urgent', phase === 'live' && seconds <= 15);
    },
    setScore(sable, rust, round, aliveS, aliveR) {
      const text = `${sable}-${rust}-${round}-${aliveS}-${aliveR}`;
      if (text === lastScore) return;
      lastScore = text;
      scoreSable.textContent = String(sable);
      scoreRust.textContent = String(rust);
      roundValue.textContent = `Round ${round}`;
      pips(aliveSable, aliveS, 3);
      pips(aliveRust, aliveR, 4);
    },
    setBomb(status, site, fuseLeft, carrying, progress) {
      if (status === 'planted') {
        bombChip.hidden = false;
        bombChip.textContent = `Bomb planted at ${site} — ${Math.ceil(fuseLeft)}s`;
        bombChip.classList.add('danger');
      } else if (status === 'planting') {
        bombChip.hidden = false;
        bombChip.textContent = `Planting the bomb at ${site} — ${Math.round((progress || 0) * 100)}%`;
        bombChip.classList.remove('danger');
      } else if (status === 'carried' && carrying) {
        bombChip.hidden = false;
        bombChip.textContent = 'You carry the bomb — plant at A or B';
        bombChip.classList.remove('danger');
      } else if (status === 'dropped') {
        bombChip.hidden = false;
        bombChip.textContent = 'Bomb dropped — pick it up';
        bombChip.classList.add('danger');
      } else {
        bombChip.hidden = true;
      }
    },
    setFeed(feed) {
      const text = feed.map((entry) => `${entry.killerName}${entry.head ? ' ☠' : ''} ${entry.victimName}`).join('|');
      if (text === lastFeed) return;
      lastFeed = text;
      killfeed.innerHTML = feed
        .map((entry) => `<div class="feed-row"><span class="${entry.killerTeam === 'sable' ? 'ally' : 'enemy'}">${entry.killerName}</span> ${entry.head ? '⌖' : '→'} <span>${entry.victimName}</span></div>`)
        .join('');
    },
    setCrosshair(spreadPx) {
      crosshair.style.setProperty('--gap', `${Math.round(spreadPx)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      damage.classList.remove('show');
      void damage.offsetWidth;
      damage.classList.add('show');
    },
    showBanner(title, sub, tone, holdMs = 3200) {
      bannerTitle.textContent = title;
      bannerSub.textContent = sub;
      banner.className = `banner show ${tone || ''}`;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('show'), holdMs);
    },
    hideBanner() {
      banner.classList.remove('show');
    },
    showBuy(items, money) {
      this.setMoney(money);
      buyItems.innerHTML = '';
      items.forEach((item, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'buy-item';
        button.disabled = item.owned || money < item.price;
        button.innerHTML = `<span class="buy-key">${index + 1}</span><span class="buy-name">${item.name}</span><span class="buy-detail">${item.detail}</span><span class="buy-price">${item.owned ? 'Owned' : `$${item.price.toLocaleString('en-US')}`}</span>`;
        button.addEventListener('click', () => {
          if (this.onBuyItem) this.onBuyItem(item.id);
        });
        buyItems.appendChild(button);
      });
      buyMenu.hidden = false;
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    get buyOpen() {
      return !buyMenu.hidden;
    },
    onBuyItem: null,
    onBuyClose: null,
    showOverlay(mode, data) {
      if (mode === 'start') {
        overlayTitle.textContent = 'Sable Line';
        overlayCopy.textContent = 'A tactical round-based shooter in Yard 7. Plant the bomb at A or B, or eliminate the Rust squad. Earn money, buy guns between rounds, first to 5 rounds takes the match.';
        playButton.textContent = 'Click to play';
      } else if (mode === 'paused') {
        overlayTitle.textContent = 'Paused';
        overlayCopy.textContent = 'Click to resume the round.';
        playButton.textContent = 'Click to resume';
      } else if (mode === 'matchEnd') {
        overlayTitle.textContent = data.winner === 'sable' ? 'Sable takes the match' : 'Rust takes the match';
        overlayCopy.textContent = `Final score ${data.sable} — ${data.rust}. ${data.winner === 'sable' ? 'Yard 7 is yours.' : 'The yard holds. Run it back.'}`;
        playButton.textContent = 'Play again';
      }
      overlay.hidden = false;
      playButton.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      playButton.addEventListener('click', handler);
    },
    onCloseBuy(handler) {
      buyClose.addEventListener('click', handler);
    },
  };
}
