/* ==========================================================================
   Кофеттория — главная: шапка, навигация по разделам меню, раскладка меню,
   «открыто / закрыто» у адресов по московскому времени.
   Без JS страница работает: шапка уезжает, навигация — обычные якоря.
   ========================================================================== */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var wide = window.matchMedia("(min-width: 1024px)");

  /* Значение токена числом: px и мс как есть, rem — в px */
  function token(name) {
    var value = getComputedStyle(root).getPropertyValue(name).trim();
    return (parseFloat(value) || 0) * (/rem$/.test(value) ? parseFloat(getComputedStyle(root).fontSize) : 1);
  }

  function all(selector, scope) {
    return Array.prototype.slice.call((scope || doc).querySelectorAll(selector));
  }

  function scrollMotion() {
    return reduceMotion.matches ? "auto" : "smooth";
  }

  /* ---------- Шапка ----------
     Два положения на всех ширинах, переход идёт по времени. Логотип, панель, текст шапки и страницу
     двигает один переход: все transform пишутся в одном кадре и не расходятся. Только transform
     на готовых слоях: ни стилей потомков, ни перерисовки.
     Класс .head-closed на <html> ведёт угасание текста и кнопок (site.css) */
  var header = doc.querySelector("[data-site-header]");
  var nav = doc.querySelector("[data-menu-nav]");
  var brand = doc.querySelector("[data-brand]");
  var bar = doc.querySelector(".site-header__bar");
  var page = doc.querySelector("main");
  var footer = doc.querySelector(".site-footer");
  var panel = doc.querySelector("[data-head-panel]");
  var headText = all(".site-header__hello, .site-header__links");
  var range = 1;
  var logoTo = { x: 0, y: 0, s: 1 };                    /* логотип в полосе: сдвиг и масштаб */
  var closed = null;                                    /* положение шапки; null — до первого показа */
  var shownP = 0;                                       /* 0 — раскрыта, 1 — свёрнута */
  var swing = 0;

  /* Кривая Безье как функция времени 0…1 */
  function bezier(x1, y1, x2, y2) {
    function at(a, b, s) {
      return 3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * b + s * s * s;
    }
    return function (t) {
      var lo = 0, hi = 1;
      for (var i = 0; i < 12; i++) {
        if (at(x1, x2, (lo + hi) / 2) < t) lo = (lo + hi) / 2;
        else hi = (lo + hi) / 2;
      }
      return at(y1, y2, (lo + hi) / 2);
    };
  }

  /* Старт мягкий: сворачивание совпадает с началом прокрутки, когда браузер занят.
     Раскрытие — та же кривая: туда и обратно с одной скоростью */
  var swingEase = bezier(0.4, 0, 0.2, 1);

  function measure() {
    var min = token("--bar-h");
    var scale = Math.min((min - 2 * token("--space-8")) / brand.offsetHeight, 1);
    var left = parseFloat(getComputedStyle(bar).paddingLeft) || 0;
    range = Math.max(header.getBoundingClientRect().height - min, 1);
    /* в конце логотип стоит у левого края полосы, по центру её высоты */
    logoTo.s = scale;
    logoTo.x = left + brand.offsetWidth * scale / 2 - brand.offsetLeft - brand.offsetWidth / 2;
    logoTo.y = min / 2 - brand.offsetTop - brand.offsetHeight / 2;
    root.style.setProperty("--menu-nav-h", nav.offsetHeight + "px");
  }

  /* Один кадр: логотип, панель шапки и страница по одному значению p.
     Низ панели и верх страницы — одна линия; сдвиг кратен физическому пикселю, чтобы между ними
     не было щели. Текст шапки едет вверх вместе с низом панели и не наезжает на строку разделов */
  function paintSwing(p) {
    shownP = p;
    var dpr = window.devicePixelRatio || 1;
    var down = Math.round(range * (1 - p) * dpr) / dpr;
    var shift = "translate3d(0," + down + "px,0)";
    var lift = "translate3d(0," + (down - range).toFixed(3) + "px,0)";
    brand.style.transform = "translate3d(" + (logoTo.x * p).toFixed(2) + "px," + (logoTo.y * p).toFixed(2) + "px,0) scale(" + (1 - (1 - logoTo.s) * p).toFixed(4) + ")";
    panel.style.transform = lift;
    headText.forEach(function (el) { el.style.transform = lift; });
    page.style.transform = shift;
    footer.style.transform = shift;
  }

  function playSwing(to) {
    window.cancelAnimationFrame(swing);
    brand.style.willChange = "";
    var from = shownP;
    var duration = token("--dur-slow");
    var start = performance.now();
    function frame(now) {
      var t = Math.min(Math.max((now - start) / duration, 0), 1);
      paintSwing(from + (to - from) * swingEase(t));
      if (t < 1) {
        swing = window.requestAnimationFrame(frame);
        return;
      }
      swing = 0;
      /* логотип встал в полосу: без will-change браузер перерисует его чётким под маленький размер */
      if (to) brand.style.willChange = "auto";
      spy();
    }
    swing = window.requestAnimationFrame(frame);
  }

  /* Сдвинулись от начала страницы — шапка сворачивается сразу, вернулись к началу — раскрывается,
     даже посреди инерции. Раскрытие может начаться и раньше: см. колёсико и палец ниже */
  var topAhead = false;                                 /* страница едет к началу: шапка не сворачивается */
  var topTimer = 0;

  function collapse() {
    var y = window.scrollY;
    if (closed === null) {                              /* первый показ — сразу, без перехода */
      closed = y > 2 || root.classList.contains("head-closed");
      root.classList.toggle("head-closed", closed);
      paintSwing(closed ? 1 : 0);
      if (closed) brand.style.willChange = "auto";
      return;
    }
    if (y <= 2) topAhead = false;
    if (closed ? y >= 1 : y <= 2 || topAhead) return;
    closed = !closed;
    root.classList.toggle("head-closed", closed);
    playSwing(closed ? 1 : 0);
  }

  /* Не доехала и встала — решает положение страницы */
  function holdTop(ms) {
    topAhead = true;
    window.clearTimeout(topTimer);
    topTimer = window.setTimeout(function () {
      topAhead = false;
      collapse();
    }, ms);
  }

  function openAhead() {
    holdTop(500);
    if (closed) {
      closed = false;
      root.classList.remove("head-closed");
      playSwing(0);
    }
  }

  /* Колёсико: шаг, который дойдёт до начала страницы, раскрывает шапку вместе с прокруткой, а не после неё.
     Шаги подряд считаем вместе: прокрутка от них отстаёт. Шаг — не больше 100: при масштабе deltaY
     бывает больше настоящего хода, а меньший шаг безопасен, шапка просто раскроется в конце пути */
  var wheelGoal = 0;
  var wheelAt = 0;

  function onWheel(e) {
    releaseSpy();
    coasting = false;
    if (e.ctrlKey || !e.deltaY || sheet.open) return;
    if (e.deltaY > 0) {
      topAhead = false;
      wheelAt = 0;
      return;
    }
    var now = performance.now();
    var step = Math.max(e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? window.innerHeight : 1), -100);
    wheelGoal = (now - wheelAt < 300 ? wheelGoal : window.scrollY) + step;
    wheelAt = now;
    if (wheelGoal <= 2) openAhead();
  }

  /* Палец: инерция затухает к началу страницы, и последние пиксели идут долго. Отпустили палец и страница
     по скорости докатится до начала — шапка раскрывается в пути, примерно за 300 мс до него, чтобы
     закончить вместе с прокруткой. Совсем рядом с началом — сразу.
     Инерция iOS: скорость затухает с постоянной около 500 мс, берём 450: лучше чуть позже, чем раскрыть зря.
     Скорость — по замерам не чаще 30 мс: близкие события дают выбросы.
     Только после того, как палец тащил страницу: нажатие по ссылке и колёсико сюда не попадают */
  var touching = false;
  var dragged = false;
  var coasting = false;
  var lastY = 0;
  var lastAt = 0;
  var speed = 0;                                        /* px/мс, вверх — больше нуля */

  function trackCoast() {
    var y = window.scrollY;
    var now = performance.now();
    var dt = now - lastAt;
    if (dt >= 30) {
      speed = dt < 120 ? (lastY - y) / dt * 0.6 + speed * 0.4 : 0;
      lastY = y;
      lastAt = now;
    }
    if (touching) dragged = true;
    if (topAhead) holdTop(250);                         /* едет — ждём, встала — через 250 мс решит положение */
    if (!coasting || !closed || speed <= 0) return;
    var rest = 1 - y / (speed * 450);                   /* больше нуля — докатится; из затухания: время до начала */
    if (y <= 24 || (rest > 0 && -450 * Math.log(rest) <= 300)) openAhead();
  }

  function onTouchStart() {
    releaseSpy();
    touching = true;
    dragged = false;
    coasting = false;
    if (topAhead) {                                     /* палец остановил инерцию: к началу уже не доедет */
      topAhead = false;
      window.clearTimeout(topTimer);
      collapse();
    }
  }

  function onTouchEnd() {
    touching = false;
    coasting = dragged;
  }

  /* ---------- Разделы: текущий раздел и группа во всех навигациях ---------- */
  var row = doc.querySelector("[data-nav-row]");
  var sheet = doc.querySelector("[data-menu-sheet]");
  var sheetOpen = doc.querySelector("[data-sheet-open]");
  var chipRows, sectionLinks, groupLinks, sections, groupOf;
  var current = null;
  var lockUntil = 0;
  var byClick = false;
  var spyTimer = 0;

  /* Список всех разделов — копия строки: те же ссылки и подсветка */
  function fillSheet() {
    var body = sheet.querySelector("[data-sheet-body]");
    body.textContent = "";
    all("[data-chips]", row).forEach(function (r) {
      var head = row.querySelector('[data-group-link="' + r.getAttribute("data-chips") + '"]').cloneNode(true);
      head.className = "menu-sheet__group";
      var list = doc.createElement("div");
      list.className = "menu-sheet__list";
      all("a", r).forEach(function (a) {
        var link = a.cloneNode(true);
        link.className = "menu-sheet__link";
        list.appendChild(link);
      });
      body.appendChild(head);
      body.appendChild(list);
    });
  }

  /* Ссылки и разделы читаем заново после обновления меню из таблицы */
  function bindMenu() {
    fillSheet();
    chipRows = all("[data-chips]");
    sectionLinks = all("[data-section-link]");
    groupLinks = all("[data-group-link]");
    sections = [];
    groupOf = {};
    sectionLinks.forEach(function (a) {
      var id = a.getAttribute("data-section-link");
      if (groupOf[id]) return;
      var section = doc.getElementById(id);
      if (!section) return;
      sections.push(section);
      groupOf[id] = section.closest(".menu-part").id;
    });
  }

  function updateFade() {
    row.classList.toggle("is-fade-start", row.scrollLeft > 1);
    row.classList.toggle("is-fade-end", row.scrollWidth - row.scrollLeft - row.clientWidth > 1);
  }

  /* Текущая вкладка — по центру строки: соседние разделы видны с обеих сторон */
  function reveal(id) {
    var chip = row.querySelector('[data-section-link="' + id + '"]');
    if (!chip) return;
    var box = chip.getBoundingClientRect();
    var rowBox = row.getBoundingClientRect();
    var left = row.scrollLeft + box.left - rowBox.left - (rowBox.width - box.width) / 2;
    row.scrollTo({ left: left, behavior: scrollMotion() });
  }

  function setCurrent(links, attr, value) {
    links.forEach(function (a) {
      if (a.getAttribute(attr) === value) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  }

  /* ПК: на экране сразу много разделов в колонках — подсвечиваем только группу «Еда | Напитки»
     и показываем её чипсы; на телефоне все разделы идут одним рядом */
  function activate(id) {
    if (!id || id === current) return;
    current = id;
    var group = groupOf[id];
    setCurrent(sectionLinks, "data-section-link", wide.matches ? null : id);
    setCurrent(groupLinks, "data-group-link", group);
    chipRows.forEach(function (r) { r.hidden = wide.matches && r.getAttribute("data-chips") !== group; });
    /* на ПК чипсы переносятся — у групп разная высота строки, якоря встают под неё */
    root.style.setProperty("--menu-nav-h", nav.offsetHeight + "px");
    reveal(id);
    updateFade();
  }

  /* Текущий — раздел, через который проходит линия; на ПК разделы в колонках —
     берём самую левую колонку (её читают первой), а текущий не меняем, пока линия в нём.
     Линия в промежутке между разделами — раздел с самым нижним верхом выше неё */
  function spy() {
    if (!sections.length || performance.now() < lockUntil) return;
    var line = token("--bar-h") + nav.offsetHeight + window.innerHeight * 0.25;
    var best = sections[0];
    var bestTop = -Infinity;
    var under = null;
    var underLeft = Infinity;
    sections.forEach(function (s) {
      var box = s.getBoundingClientRect();
      if (box.top <= line && box.top > bestTop) {
        best = s;
        bestTop = box.top;
      }
      if (box.top <= line && box.bottom > line && (s.id === current ? -1 : box.left) < underLeft) {
        under = s;
        underLeft = s.id === current ? -1 : box.left;
      }
    });
    if (under) best = under;
    if (window.innerHeight + window.scrollY >= root.scrollHeight - 2 && bestTop < 0) {
      best = sections[sections.length - 1];
    }
    activate(best.id);
  }

  /* Нажатие в строке разделов или окне: подсветка сразу */
  function pick(a) {
    var group = a.getAttribute("data-group-link");
    var first = group
      ? sections.filter(function (s) { return groupOf[s.id] === group; })[0]
      : doc.getElementById(a.getAttribute("data-section-link"));
    if (first) activate(first.id);
  }

  /* Прокрутка по нажатию на вкладку закончилась: раздел остаётся выбранным, хотя линия может стоять
     уже в соседнем; 100 мс — на последний кадр прокрутки */
  function onScrollEnd() {
    if (byClick) {
      byClick = false;
      lockUntil = performance.now() + 100;
    } else {
      lockUntil = 0;
      spy();
    }
  }

  /* Палец или колесо прерывают прокрутку по нажатию: дальше подсветка снова следует за страницей */
  function releaseSpy() {
    lockUntil = 0;
    byClick = false;
  }

  /* Якоря ведём сами: плавно от текущего места и без сдвига страницы, пока шапка раскрыта.
     Разделы по пути не подсвечиваем: на длинном пути это лишняя работа на каждом кадре;
     у ссылки вне строки разделов подсветка обновится в конце пути (без scrollend — по таймеру).
     Запись истории — до прокрутки: в прежней остаётся текущее место, к нему вернёт «назад».
     Фокус — на цель, как при переходе браузера: следующий Tab идёт от неё */
  function onAnchorClick(e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;   /* новая вкладка и окно — за браузером */
    var hash = a.getAttribute("href");
    if (hash === "#top") {                              /* логотип и надпись в шапке */
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: scrollMotion() });
      return;
    }
    var target = hash.length > 1 && doc.getElementById(hash.slice(1));
    if (!target) return;
    e.preventDefault();
    var fromNav = a.hasAttribute("data-section-link") || a.hasAttribute("data-group-link");
    if (fromNav) pick(a);
    var shift = new DOMMatrixReadOnly(getComputedStyle(page).transform).m42;
    var pad = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    var top = target.getBoundingClientRect().top + window.scrollY - shift - pad;
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    lockUntil = performance.now() + 1500;
    byClick = fromNav;
    window.clearTimeout(spyTimer);
    if (!fromNav) spyTimer = window.setTimeout(spy, 1600);
    window.scrollTo({ top: Math.max(top, 0), behavior: scrollMotion() });
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }

  /* ---------- Окно «Все разделы»: ссылка закрывает окно, дальше работает обработчик якорей ---------- */
  sheetOpen.hidden = false;

  sheetOpen.addEventListener("click", function () {
    sheet.showModal();
    var currentLink = sheet.querySelector('.menu-sheet__link[aria-current="true"]');
    if (currentLink) currentLink.scrollIntoView({ block: "nearest" });
  });

  sheet.querySelector("[data-sheet-close]").addEventListener("click", function () {
    sheet.close();
  });

  sheet.addEventListener("click", function (e) {
    if (e.target.closest("a")) {
      sheet.close();
    } else if (e.target === sheet) {                    /* нажатие мимо окна, по затемнению */
      var box = sheet.getBoundingClientRect();
      var inside = e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
      if (!inside) sheet.close();
    }
  });

  /* ---------- Раскладка меню: подстраивается под число позиций и ширину экрана ----------
     Сколько колонок — решает ширина; какой раздел в какой — реальная высота разделов:
     колонки выравниваются, порядок разделов сохраняется, «Колонка на ПК» из таблицы — закон.
     Раздел выше экрана и заметно выше остальных занимает всю ширину, его строки идут колонками */
  var menuContent = doc.querySelector(".menu__content");
  var lastLayoutWidth = 0;

  /* Разделы подряд по колонкам: минимум суммы квадратов высот (самые ровные колонки) */
  function partition(heights, pins, n) {
    var m = heights.length;
    var best = [], from = [];
    for (var c = 0; c <= n; c++) {
      best.push([]);
      from.push([]);
      for (var i = 0; i <= m; i++) best[c].push(i === 0 ? 0 : Infinity);
    }
    for (c = 1; c <= n; c++) {
      for (i = 0; i <= m; i++) {
        var sum = 0, allowed = true;
        for (var j = i; j >= 0 && allowed; j--) {       /* разделы j…i-1 — в колонке c */
          if (j < i) {
            sum += heights[j];
            if (pins[j] && Math.min(pins[j], n) !== c) { allowed = false; break; }
          }
          var cost = best[c - 1][j] + sum * sum;
          if (cost < best[c][i]) {
            best[c][i] = cost;
            from[c][i] = j;
          }
        }
      }
    }
    if (best[n][m] === Infinity) {                      /* закрепления противоречат порядку разделов */
      return partition(heights, heights.map(function () { return 0; }), n);
    }
    var columns = [];
    for (c = n, i = m; c >= 1; c--) {
      var start = from[c][i] === undefined ? i : from[c][i];
      columns.unshift({ start: start, end: i });
      i = start;
    }
    return columns;
  }

  function columnHeight(columns, heights) {
    return Math.max.apply(null, columns.map(function (col) {
      return heights.slice(col.start, col.end).reduce(function (a, b) { return a + b; }, 0);
    }));
  }

  function restoreSplit(section) {
    var split = section.querySelector(".menu-section__split");
    if (!split) return;
    var list = section.querySelector(":scope > .menu-list");
    all(".menu-item", split).forEach(function (li) { list.appendChild(li); });
    split.remove();
    section.classList.remove("menu-section--wide");
  }

  /* Длинный раздел: строки равными частями по колонкам, над каждой — свои объёмы */
  function splitSection(section, n) {
    var list = section.querySelector(":scope > .menu-list");
    var rows = all(".menu-item", list);
    var volumes = section.querySelector(".menu-section__head .menu-volumes");
    var split = doc.createElement("div");
    split.className = "menu-section__split";
    split.style.setProperty("--n", n);
    var perColumn = Math.ceil(rows.length / n);
    for (var c = 0; c < n; c++) {
      var chunk = doc.createElement("div");
      if (volumes) chunk.appendChild(volumes.cloneNode(true));
      var ul = doc.createElement("ul");
      ul.className = "menu-list";
      ul.setAttribute("role", "list");
      rows.slice(c * perColumn, (c + 1) * perColumn).forEach(function (li) { ul.appendChild(li); });
      chunk.appendChild(ul);
      split.appendChild(chunk);
    }
    section.classList.add("menu-section--wide");
    section.appendChild(split);
  }

  function makeBand(n) {
    var band = doc.createElement("div");
    band.className = "menu-part__band";
    band.style.setProperty("--n", n);
    return band;
  }

  function makeColumn(band) {
    var col = doc.createElement("div");
    col.className = "menu-part__col";
    band.appendChild(col);
    return col;
  }

  function layoutPart(part, n, gap) {
    var holder = part.querySelector(".menu-part__sections");
    var partSections = all(".menu-section", part);
    partSections.forEach(restoreSplit);
    var plain = partSections.filter(function (s) { return !s.classList.contains("menu-section--boxed"); });
    var boxes = partSections.filter(function (s) { return s.classList.contains("menu-section--boxed"); });
    boxes.forEach(function (b) { b.classList.remove("is-in-band"); });
    holder.classList.add("is-laid");

    /* Замер: всё в первую колонку сетки нужной ширины; рамка — и узкой, и во всю ширину */
    holder.textContent = "";
    var probe = makeBand(n);
    var probeCol = makeColumn(probe);
    for (var k = 1; k < n; k++) makeColumn(probe);
    holder.appendChild(probe);
    plain.forEach(function (s) { probeCol.appendChild(s); });
    var heights = plain.map(function (s) {
      return s.getBoundingClientRect().height - parseFloat(getComputedStyle(s).paddingBottom) + gap;
    });
    var box = boxes.length === 1 ? boxes[0] : null;
    var boxNarrow = 0, boxWide = 0;
    if (box && n > 1) {
      probeCol.appendChild(box);
      boxNarrow = box.getBoundingClientRect().height;
    }
    boxes.forEach(function (b) { holder.appendChild(b); });
    if (box) boxWide = box.getBoundingClientRect().height;

    /* Полосы: разделы колонками, между ними — разделы на всю ширину */
    var total = heights.reduce(function (a, b) { return a + b; }, 0);
    var tall = Math.max(1.2 * total / n, window.innerHeight * 0.9);
    var runs = [{ list: [] }];
    plain.forEach(function (s, i) {
      var simple = !s.querySelector(".menu-section__head--sub, .menu-extras");
      if (n > 1 && heights[i] > tall && simple) {
        runs.push({ wide: s }, { list: [] });
      } else {
        runs[runs.length - 1].list.push(i);
      }
    });

    holder.textContent = "";
    runs.forEach(function (run, r) {
      if (run.wide) {
        holder.appendChild(run.wide);
        splitSection(run.wide, n);
        return;
      }
      if (!run.list.length) return;
      var hs = run.list.map(function (i) { return heights[i]; });
      var pins = run.list.map(function (i) { return parseInt(plain[i].getAttribute("data-column"), 10) || 0; });
      var columns = partition(hs, pins, n);
      /* Рамка в последней колонке, если так меню получается короче, чем с рамкой под колонками */
      var inBand = false;
      if (box && r === runs.length - 1 && n > 1) {
        var narrower = partition(hs, pins, n - 1);
        if (Math.max(columnHeight(narrower, hs), boxNarrow) <= columnHeight(columns, hs) + gap + boxWide) {
          columns = narrower;
          inBand = true;
        }
      }
      var band = makeBand(n);
      columns.forEach(function (col) {
        var el = makeColumn(band);
        for (var i = col.start; i < col.end; i++) el.appendChild(plain[run.list[i]]);
      });
      if (inBand) {
        makeColumn(band).appendChild(box);
        box.classList.add("is-in-band");
      }
      holder.appendChild(band);
    });
    boxes.forEach(function (b) {
      if (!b.classList.contains("is-in-band")) holder.appendChild(b);
    });
  }

  function layoutMenu(force) {
    var width = menuContent.clientWidth;
    if (!force && width === lastLayoutWidth) return;
    lastLayoutWidth = width;
    var gap = token("--space-48");
    var col = token("--menu-col");
    var n = wide.matches ? Math.max(1, Math.floor((width + gap) / (col + gap))) : 1;
    var rowGap = token("--menu-group-gap");
    all(".menu-part", menuContent).forEach(function (part) { layoutPart(part, n, rowGap); });
  }

  /* ---------- Меню из Google Таблицы: если отличается от вшитого — заменяем ---------- */
  var menuData = window.KofettoriaMenu;

  function normalize(html) {
    return html.replace(/<!--[\s\S]*?-->/g, "").replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
  }

  function parsed(html) {
    var tmp = doc.createElement("div");
    tmp.innerHTML = html;
    return normalize(tmp.innerHTML);
  }

  /* Вшитое меню и строку разделов запоминаем до первой раскладки: с ними сравнивается таблица
     (в таблице могла поменяться только подпись кнопки раздела) */
  var shownMenu = normalize(menuContent.innerHTML) + normalize(row.innerHTML);

  function applyMenu(menu) {
    var html = menuData.renderMenu(menu);
    var navHtml = menuData.renderNav(menu);
    var next = parsed(html) + parsed(navHtml);
    if (next === shownMenu) return;
    shownMenu = next;
    menuContent.innerHTML = html;
    row.innerHTML = navHtml;
    bindMenu();
    current = null;
    layoutMenu(true);
    measure();
    spy();
    updateFade();
  }

  function loadMenu() {
    var id = doc.querySelector("[data-sheet-id]").getAttribute("data-sheet-id");
    if (!id) return;
    menuData.fetchMenu(id).then(applyMenu).catch(function (err) {
      console.info("Меню: таблица недоступна, показано вшитое (" + err.message + ")");
    });
  }

  /* ---------- Адреса: открыто ли сейчас (Москва) ---------- */
  var DAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  var DAY_IN = ["в понедельник", "во вторник", "в среду", "в четверг", "в пятницу", "в субботу", "в воскресенье"];

  function moscowNow() {
    var parts = {};
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Moscow", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    return { day: DAY_INDEX[parts.weekday], minutes: (parseInt(parts.hour, 10) % 24) * 60 + parseInt(parts.minute, 10) };
  }

  function toMinutes(hhmm) {
    var t = hhmm.split(":");
    return parseInt(t[0], 10) * 60 + parseInt(t[1], 10);
  }

  function statusText(hours, now) {
    var today = hours[now.day];
    if (today) {
      var span = today.split("-");
      if (now.minutes >= toMinutes(span[0]) && now.minutes < toMinutes(span[1])) {
        return { open: true, text: "Открыто до " + span[1] };
      }
      if (now.minutes < toMinutes(span[0])) {
        return { open: false, text: "Закрыто · откроется в " + span[0] };
      }
    }
    for (var i = 1; i <= 7; i++) {
      var day = (now.day + i) % 7;
      if (hours[day]) {
        var when = i === 1 ? "завтра" : DAY_IN[day];
        return { open: false, text: "Закрыто · откроется " + when + " в " + hours[day].split("-")[0] };
      }
    }
    return { open: false, text: "Закрыто" };
  }

  function updateStatus() {
    var now = moscowNow();
    all("[data-hours]").forEach(function (card) {
      var el = card.querySelector("[data-place-status]");
      var s = statusText(JSON.parse(card.getAttribute("data-hours")), now);
      el.textContent = s.text;
      el.classList.toggle("is-open", s.open);
      el.hidden = false;
    });
  }

  /* ---------- Прокрутка и размеры ---------- */
  var ticking = false;

  function onScroll() {
    trackCoast();
    collapse();                                         /* сразу, не ждём кадра */
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      spy();
    });
  }

  function onResize() {
    if (sheet.open && wide.matches) sheet.close();
    layoutMenu();
    measure();
    collapse();
    if (!swing) paintSwing(shownP);                     /* размеры могли измениться */
    current = null;
    spy();
    updateFade();
  }

  /* ---------- Запуск ---------- */
  doc.addEventListener("click", onAnchorClick);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("scrollend", onScrollEnd);
  window.addEventListener("wheel", onWheel, { passive: true });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("touchcancel", onTouchEnd, { passive: true });
  window.addEventListener("resize", onResize);
  row.addEventListener("scroll", updateFade, { passive: true });
  doc.fonts.ready.then(function () {
    layoutMenu(true);                                   /* шрифт меняет высоту разделов */
    onResize();
  });

  bindMenu();
  layoutMenu(true);
  measure();
  /* Открыли страницу со ссылкой на раздел: шапка свёрнута ещё в <head>, браузер ведёт к разделу
     без сдвига; если цель в самом начале страницы, после загрузки шапка раскроется */
  if (root.classList.contains("head-closed")) window.addEventListener("load", collapse);
  collapse();
  spy();
  updateFade();
  updateStatus();
  window.setInterval(updateStatus, 60000);
  loadMenu();
})();
