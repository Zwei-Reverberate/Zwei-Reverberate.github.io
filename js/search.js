/// <reference path="./anatolo.js" />
/// <reference types="fuse.js" />

/** @type {typeof import("fuse.js").default} */
var Fuse;

class AnatoloSearch {
  /** @type {AnatoloDynamicContent} */
  searchData;
  config;
  showing = false;
  init() {
    this.fuses = {};
    this.fuse_ok = new AnatoloRef(false);

    // TODO: lazy load data
    this.fetchSearchData();

    this.mainEl = $('.ins-search');
    this.inputEl = this.mainEl.find('.ins-search-input');
    this.wrapperEl = this.mainEl.find('.ins-section-wrapper');
    this.containerEl = this.mainEl.find('.ins-section-container');

    this.mainEl.parent().remove('.ins-search');
    $('body').append(this.mainEl);

    this.inputEl
      .on('keydown', (e) => {
        switch (e.code) {
          case 'ArrowDown':
            this.markActive(this.getSelectedIndex() + 1);
            break;
          case 'ArrowUp':
            this.markActive(this.getSelectedIndex() - 1);
            break;
          case 'Enter':
            const url = $('.ins-selectable.active').data('url');
            if (url) this.gotoLink(url);
            break;
          case 'Escape':
            this.closeWindow();
            break;
        }
      })
      .on('input', (e) => {
        Anatolo.nextTick(() => {
          this.search();
        });
      });

    $(document)
      .on('keydown', (e) => {
        if (e.key == 's' && !this.showing) Anatolo.nextTick(() => this.openWindow());
      })
      .on('click', (e) => {
        if (e.target !== this.inputEl[0] && this.showing) {
          this.closeWindow();
        }
      });

    Anatolo.emit('search-init');
  }

  fetchSearchData() {
    this.searchData = new AnatoloDynamicContent('content.json');
    this.buildFuse();
  }

  getSelectedIndex() {
    let index = -1;
    $('.ins-selectable').each((id, elem) => {
      if ($(elem).hasClass('active')) index = id;
    });
    return index;
  }
  markActive(index) {
    const items = $('.ins-selectable');
    items.removeClass('active');
    index = (index + (index == -2) + items.length) % items.length;
    $(items[index]).addClass('active');
  }

  gotoLink(url) {
    Anatolo.router.routeTo(url);
    this.closeWindow();
  }
  makeSearchItem(icon, title, slug, preview, url) {
    return $('<div>')
      .addClass('ins-selectable')
      .addClass('ins-search-item')
      .append(
        $('<header>')
          .append(
            $('<i>')
              .addClass('fa')
              .addClass('fa-' + icon),
          )
          .append(
            $('<span>')
              .addClass('ins-title')
              .html(title != null && title !== '' ? title : this.config.translation['untitled']),
          )
          .append(slug ? $('<span>').addClass('ins-slug').html(slug) : null),
      )
      .append(preview ? $('<p>').addClass('ins-search-preview').html(preview) : null)
      .attr('data-url', url)
      .on('click', () => this.gotoLink(url));
  }

  makeSection(type, array) {
    const sectionTitle = this.config.translation[type];
    let searchItems;
    if (array.length === 0) return null;

    searchItems = array.map((item) => {
      const newItem = {};
      for (const key of Object.keys(item)) {
        if (key === 'link') {
          newItem[key] = item[key];
          continue;
        }
        newItem[key] = escapeHTML(item[key]);
      }
      for (const matched of item.matches ?? []) {
        if (matched.key === 'link') continue;

        const [st, ed] = matched.indices.reduce((a, b) => (a[1] - a[0] < b[1] - b[0] ? b : a), [0, -1]);

        newItem[matched.key] =
          escapeHTML(item[matched.key].slice(0, st)) +
          '<mark>' +
          escapeHTML(item[matched.key].slice(st, ed + 1)) +
          '</mark>' +
          escapeHTML(item[matched.key].slice(ed + 1));
        if (matched.key === 'text') {
          newItem.text = newItem.text.slice(Math.max(st - 20, 0));
        }
      }

      if (['posts', 'pages'].includes(type)) {
        return this.makeSearchItem('file', newItem.title, null, newItem.text.slice(0, 150), newItem.link);
      }
      if (['categories', 'tags'].includes(type)) {
        return this.makeSearchItem(
          type === 'CATEGORIES' ? 'folder' : 'tag',
          newItem.name,
          newItem.slug,
          null,
          newItem.link,
        );
      }
      return null;
    });

    return $('<section>')
      .addClass('ins-section')
      .append($('<header>').addClass('ins-section-header').text(sectionTitle))
      .append(searchItems);
  }
  async buildFuse() {
    const data = await this.searchData.data();
    Fuse.config.ignoreLocation = true;
    Fuse.config.includeMatches = true;
    for (const key of ['posts', 'pages']) {
      const conf = {
        keys: ['title', 'text', 'link'],
      };
      this.fuses[key] = new Fuse(data[key], conf);
    }
    for (const key of ['tags', 'categories']) {
      const conf = {
        keys: ['title', 'text', 'link'],
      };
      this.fuses[key] = new Fuse(data[key], conf);
    }
    this.fuse_ok.value = true;
  }

  async getSearchResult(keyword) {
    await this.fuse_ok.unitl(true);
    const data = await this.searchData.data();
    return Object.fromEntries(
      ['posts', 'pages', 'categories', 'tags'].map((t) => [
        t,
        keyword ? this.fuses[t].search(keyword, { limit: 5 }).map((i) => ({ ...i, ...i.item })) : data[t].slice(0, 5),
      ]),
    );
  }

  search() {
    const keyword = this.inputEl.val();
    this.getSearchResult(keyword).then((res) => {
      this.searchResultToDOM(res);
    });
  }

  searchResultToDOM(searchResult) {
    this.containerEl.empty();
    for (var key in searchResult) {
      this.containerEl.append(this.makeSection(key.toLowerCase(), searchResult[key]));
    }
  }

  selectItemByDiff(value) {
    var $items = $.makeArray(this.containerEl.find('.ins-selectable'));
    var prevPosition = -1;
    $items.forEach(function (item, index) {
      if ($(item).hasClass('active')) {
        prevPosition = index;
        return;
      }
    });
    var nextPosition = ($items.length + prevPosition + value) % $items.length;
    $($items[prevPosition]).removeClass('active');
    $($items[nextPosition]).addClass('active');
    scrollTo($($items[nextPosition]));
  }

  openWindow() {
    this.mainEl.removeClass('fadeOut').addClass('animated fadeIn').addClass('show');
    this.mainEl.find('.ins-search-input').trigger('focus');
    Anatolo.nextTick(() => {
      this.inputEl[0].setSelectionRange(0, this.inputEl.val().length);
      this.showing = true;
    });
    this.search();
  }

  closeWindow() {
    if (!this.showing) return;
    $('.navbar-main').css('pointer-events', 'none');
    this.mainEl.removeClass('fadeIn');
    this.mainEl.addClass('fadeOut');
    this.inputEl.trigger('blur');
    this.showing = false;
    setTimeout(() => {
      $('.navbar-main').css('pointer-events', 'auto');
      this.mainEl.removeClass('show');
    }, 400);
  }
}

Anatolo.search = new AnatoloSearch();
Anatolo.search.init();
