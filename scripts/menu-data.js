/* ==========================================================================
   Кофеттория — меню из Google Таблицы: чтение, проверка строк, разметка.
   Разметка повторяет tools/build_site.py, правила строк — tools/sync_menu.py:
   таблица и вшитое в страницу меню дают одинаковый результат.
   Таблица недоступна или пуста — на странице остаётся вшитое меню.
   ========================================================================== */
(function () {
  "use strict";

  var SECTIONS_TAB = "Разделы";
  var ITEMS_TAB = "Позиции";
  var MAX_VOLUMES = 4;
  var TIMEOUT_MS = 5000;

  /* ---------- Текст, как в build_site.py ---------- */
  var SHORT_WORD = /(^|[^\wА-Яа-яЁё])(с|и|в|на|из|без|3-х|\d+) /gi;

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  }

  function text(s) {
    var out = escapeHtml(s);
    var prev;
    do {                                     /* второй проход: предлоги подряд («с и ») */
      prev = out;
      out = out.replace(SHORT_WORD, "$1$2&nbsp;");
    } while (out !== prev);
    return out.replace(/(\S+\/\S+)/g, '<span class="no-wrap">$1</span>');
  }

  var TRANSLIT = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };

  function slug(title, used) {
    var base = String(title).toLowerCase().replace(/[а-яё]/g, function (c) { return TRANSLIT[c]; })
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
    var id = base;
    for (var n = 2; used[id]; n++) id = base + "-" + n;
    used[id] = true;
    return id;
  }

  /* ---------- CSV (RFC 4180) -> строки-объекты по заголовкам ---------- */
  function parseCsv(csv) {
    var rows = [[]], cell = "", quoted = false;
    for (var i = 0; i < csv.length; i++) {
      var c = csv[i];
      if (quoted) {
        if (c === '"' && csv[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") { rows[rows.length - 1].push(cell); cell = ""; }
      else if (c === "\n") { rows[rows.length - 1].push(cell); cell = ""; rows.push([]); }
      else if (c !== "\r") cell += c;
    }
    rows[rows.length - 1].push(cell);
    var head = rows.shift().map(function (h) { return h.trim(); });
    return rows.map(function (r) {
      var row = {};
      head.forEach(function (h, n) { row[h] = (r[n] || "").trim(); });
      return row;
    });
  }

  function isTrue(v) {
    return /^(true|истина|1|да)$/i.test(v || "");
  }

  function toPrice(v) {
    var digits = String(v || "").replace(/\D/g, "");
    return digits ? parseInt(digits, 10) : null;
  }

  function volumesOf(row) {
    var out = [];
    for (var n = 1; n <= MAX_VOLUMES; n++) if (row["Объём " + n]) out.push(row["Объём " + n]);
    return out;
  }

  /* Строка без названия, раздела или цены на сайт не попадает */
  function toItem(row, volumes) {
    var cells = [];
    for (var n = 1; n <= MAX_VOLUMES; n++) cells.push(toPrice(row["Цена " + n]));
    var filled = cells.filter(function (p) { return p !== null; });
    if (!row["Название"] || isTrue(row["Скрыть"]) || !filled.length) return null;
    var item = { name: row["Название"] };
    if (row["Уточнение"]) item.note = row["Уточнение"];
    if (volumes.length > 1) item.prices = cells.slice(0, volumes.length);
    else if (volumes.length === 1) item.prices = [filled[0]];
    else item.price = filled[0];
    if (item.prices && !item.prices.some(function (p) { return p !== null; })) return null;
    return item;
  }

  /* ---------- Строки таблицы -> меню (та же форма, что content/menu.json) ---------- */
  function fromRows(sectionRows, itemRows) {
    var known = {};
    sectionRows.forEach(function (r) {
      if (r["Раздел"] && !isTrue(r["Скрыть"])) known[r["Раздел"]] = r;
    });
    var itemsBy = {};
    itemRows.forEach(function (r) {
      var section = known[r["Раздел"]];
      if (!section) return;
      var item = toItem(r, volumesOf(section));
      if (item) (itemsBy[r["Раздел"]] = itemsBy[r["Раздел"]] || []).push(item);
    });

    var used = {}, groups = [], groupBy = {};
    sectionRows.forEach(function (r) {
      var title = r["Раздел"];
      if (!known[title] || known[title] !== r) return;
      var parent = r["Входит в раздел"];
      if (parent && known[parent]) return;           /* подгруппы собираются у родителя */
      var children = sectionRows.filter(function (c) {
        return c["Входит в раздел"] === title && known[c["Раздел"]] === c && itemsBy[c["Раздел"]];
      });
      var boxed = isTrue(r["В рамке"]);
      var own = itemsBy[title] || [];
      if (!own.length && !children.length) return;   /* пустой раздел не показываем */

      var section = { id: slug(title, used), chip: r["Кнопка"] || title, title: title };
      if (r["Приписка"]) section.tail = r["Приписка"];
      var column = parseInt(r["Колонка на ПК"], 10);
      if (column > 0) section.column = column;
      if (boxed) section.boxed = true;
      var volumes = volumesOf(r);
      if (volumes.length) section.volumes = volumes;
      section.items = own;
      if (children.length) {
        var subs = children.map(function (c) {
          var sub = { title: c["Раздел"] };
          var subVolumes = volumesOf(c);
          if (subVolumes.length) sub.volumes = subVolumes;
          sub.items = itemsBy[c["Раздел"]];
          return sub;
        });
        section[boxed ? "groups" : "more"] = subs;
      }

      var groupTitle = r["Группа"] || "Меню";
      if (!groupBy[groupTitle]) {
        groupBy[groupTitle] = { id: slug(groupTitle, used), title: groupTitle, sections: [] };
        groups.push(groupBy[groupTitle]);
      }
      groupBy[groupTitle].sections.push(section);
    });
    return { groups: groups };
  }

  /* ---------- Разметка, как в build_site.py ---------- */
  var NONE = '<span class="menu-item__price menu-item__price--none" aria-hidden="true">' +
    '<svg class="menu-item__dash" viewBox="0 0 25 7" preserveAspectRatio="none" focusable="false">' +
    '<path d="M0 7L25 0" vector-effect="non-scaling-stroke"/></svg></span>';

  function price(value, volume) {
    var vol = volume ? '<span class="visually-hidden">' + escapeHtml(volume) + ": </span>" : "";
    return vol + value + '&nbsp;<span aria-hidden="true">₽</span><span class="visually-hidden"> рублей</span>';
  }

  function itemHtml(it, volumes) {
    var note = it.note ? ' <span class="menu-item__note">(' + text(it.note) + ")</span>" : "";
    var title = '<span class="menu-item__title">' + text(it.name) + note + "</span>";
    var leader = '<span class="menu-item__leader" aria-hidden="true"></span>';
    var prices = it.prices;
    if (!prices || prices.length === 1) {
      var value = prices ? prices[0] : it.price;
      return '<li class="menu-item">' + title + leader + '<span class="menu-item__price">' +
        price(value, volumes[0]) + "</span></li>";
    }
    var cells = prices.map(function (p, n) {
      return p !== null ? '<span class="menu-item__price">' + price(p, volumes[n]) + "</span>" : NONE;
    }).join("");
    return '<li class="menu-item menu-item--cols-' + prices.length + '">' + title + leader +
      '<span class="menu-item__prices">' + cells + "</span></li>";
  }

  function listHtml(items, volumes) {
    return '<ul class="menu-list" role="list">' +
      items.map(function (it) { return itemHtml(it, volumes); }).join("") + "</ul>";
  }

  function volumesHtml(volumes) {
    if (!volumes.length) return "";
    return '<div class="menu-volumes menu-volumes--' + volumes.length + '" aria-hidden="true">' +
      volumes.map(function (v) { return "<span>" + escapeHtml(v) + "</span>"; }).join("") + "</div>";
  }

  function hasLongPrice(s) {
    var blocks = [s].concat(s.groups || [], s.more || []);
    return blocks.some(function (b) {
      return (b.items || []).some(function (it) {
        return (it.prices || [it.price]).some(function (p) { return p >= 1000; });
      });
    });
  }

  function sectionHtml(s) {
    var volumes = s.volumes || [];
    var cls = "menu-section" + (s.boxed ? " menu-section--boxed" : "") + (hasLongPrice(s) ? " menu-section--long-prices" : "");
    var tail = s.tail ? ' <span class="board-heading__tail">' + text(s.tail) + "</span>" : "";
    var body = s.items && s.items.length ? listHtml(s.items, volumes) : "";
    if (s.groups) {
      body += '<div class="menu-extras menu-extras--' + Math.min(s.groups.length, 4) + '">' + s.groups.map(function (g) {
        return '<div class="menu-extras__group"><h4 class="menu-extras__title">' + text(g.title) + "</h4>" + listHtml(g.items, []) + "</div>";
      }).join("") + "</div>";
    }
    (s.more || []).forEach(function (b) {
      var bv = b.volumes || [];
      body += '<div class="menu-section__head menu-section__head--sub"><h4 class="menu-section__subtitle">' +
        text(b.title) + "</h4>" + volumesHtml(bv) + "</div>" + listHtml(b.items, bv);
    });
    var pin = s.column ? ' data-column="' + s.column + '"' : "";
    return '<section class="' + cls + '" id="' + s.id + '" aria-labelledby="' + s.id + '-title"' + pin + ">" +
      '<div class="menu-section__head"><h3 class="board-heading menu-section__title" id="' + s.id + '-title">' +
      text(s.title) + tail + "</h3>" + volumesHtml(volumes) + "</div>" + body + "</section>";
  }

  function renderMenu(menu) {
    return menu.groups.map(function (g) {
      var plain = g.sections.filter(function (s) { return !s.boxed; });
      var boxed = g.sections.filter(function (s) { return s.boxed; }).map(sectionHtml).join("");
      var pinned = plain.some(function (s) { return s.column; });
      var body;
      if (pinned) {
        var cols = {};
        plain.forEach(function (s) { (cols[s.column || 2] = cols[s.column || 2] || []).push(s); });
        body = '<div class="menu-part__sections menu-part__sections--cols">' + Object.keys(cols).sort().map(function (c) {
          return '<div class="menu-part__col">' + cols[c].map(sectionHtml).join("") + "</div>";
        }).join("") + boxed + "</div>";
      } else {
        body = '<div class="menu-part__sections">' + plain.map(sectionHtml).join("") + "</div>" + boxed;
      }
      return '<section class="menu-part" id="' + g.id + '" aria-labelledby="' + g.id + '-title">' +
        '<h2 class="menu-part__title" id="' + g.id + '-title">' + text(g.title) + "</h2>" + body + "</section>";
    }).join("");
  }

  function renderNav(menu) {
    var switcher = menu.groups.map(function (g) {
      return '<a class="menu-switch__item" href="#' + g.id + '" data-group-link="' + g.id + '">' + text(g.title) + "</a>";
    }).join("");
    var rows = menu.groups.map(function (g) {
      return '<div class="menu-nav__chips" data-chips="' + g.id + '" role="group" aria-label="' + escapeHtml(g.title) + ': разделы">' +
        g.sections.map(function (s) {
          return '<a class="chip" href="#' + s.id + '" data-section-link="' + s.id + '">' + text(s.chip) + "</a>";
        }).join("") + "</div>";
    }).join("");
    return '<div class="menu-switch">' + switcher + "</div>" + rows;
  }

  /* ---------- Загрузка: лист таблицы как CSV (нужен доступ «все, у кого есть ссылка») ---------- */
  function fetchTab(id, tab, signal) {
    var url = "https://docs.google.com/spreadsheets/d/" + encodeURIComponent(id) +
      "/gviz/tq?tqx=out:csv&headers=1&sheet=" + encodeURIComponent(tab);
    return fetch(url, { signal: signal, credentials: "omit" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    });
  }

  function fromCsv(sectionsCsv, itemsCsv) {
    return fromRows(parseCsv(sectionsCsv), parseCsv(itemsCsv));
  }

  /* Страница открыта с диска (file://): у неё нет адреса, и Google не отдаёт CSV по fetch.
     Только для этого случая читаем лист как скрипт с функцией обратного вызова */
  var scriptCalls = 0;

  function loadTabScript(id, tab) {
    return new Promise(function (resolve, reject) {
      var name = "kofettoriaMenuTab" + (++scriptCalls);
      var script = document.createElement("script");
      var timer = setTimeout(function () { done(); reject(new Error("таймаут")); }, TIMEOUT_MS);
      function done() {
        clearTimeout(timer);
        delete window[name];
        script.remove();
      }
      window[name] = function (response) {
        done();
        if (response.status !== "ok") { reject(new Error("ответ таблицы: " + response.status)); return; }
        var head = response.table.cols.map(function (c) { return (c.label || "").trim(); });
        resolve(response.table.rows.map(function (r) {
          var row = {};
          head.forEach(function (h, n) {
            var cell = r.c[n];
            var v = cell && cell.v !== null && cell.v !== undefined ? cell.v : "";
            row[h] = String(v === true ? "TRUE" : v === false ? "FALSE" : v).trim();
          });
          return row;
        }));
      };
      script.onerror = function () { done(); reject(new Error("не загрузилось")); };
      script.src = "https://docs.google.com/spreadsheets/d/" + encodeURIComponent(id) +
        "/gviz/tq?headers=1&tqx=" + encodeURIComponent("out:json;responseHandler:" + name) +
        "&sheet=" + encodeURIComponent(tab);
      document.head.appendChild(script);
    });
  }

  function checked(menu) {
    if (!menu.groups.length) throw new Error("в таблице нет позиций");
    return menu;
  }

  function fetchMenu(id) {
    if (location.protocol === "file:") {
      return Promise.all([loadTabScript(id, SECTIONS_TAB), loadTabScript(id, ITEMS_TAB)])
        .then(function (tabs) { return checked(fromRows(tabs[0], tabs[1])); });
    }
    var abort = new AbortController();
    var timer = setTimeout(function () { abort.abort(); }, TIMEOUT_MS);
    return Promise.all([fetchTab(id, SECTIONS_TAB, abort.signal), fetchTab(id, ITEMS_TAB, abort.signal)])
      .then(function (csv) {
        clearTimeout(timer);
        return checked(fromCsv(csv[0], csv[1]));
      });
  }

  window.KofettoriaMenu = {
    renderMenu: renderMenu,
    renderNav: renderNav,
    fetchMenu: fetchMenu
  };
})();
