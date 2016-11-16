'use strict';

const fs = require('fs');
const url = require('url');
const request = require('request');
const async = require('async');
const _ = require('lodash');
const cheerio = require('cheerio');

const baseUrl = 'https://aws.amazon.com/faqs/';
const CONCURRENCY = 10;

// skip these faqs for different page format
const SKIPPING_FAQS = ['fps'];

// Gets a page and returns a callback with a $ object
function getPage(url, fn) {
  console.log('fetch page: ' + url);
  request({
    url: url,
    timeout: 60 * 1000
  }, function (error, response, body) {
    fn(cheerio.load(body))
  });
}

getPage(baseUrl, function ($) {
  let category = null;
  let secitons = $('.parsys.col1 > div.section').map(function () {
    const section = $(this);
    if (section.hasClass('title-wrapper')) {
      category = _.trim($('h2 a', section).text());
    } else if (section.hasClass('aws-text-box')) {
      let u = _.trim($('a', section).attr('href'));
      let part = u.split('/');
      let name = part[part.length - 3];
      if (name && !_.includes(SKIPPING_FAQS, name)) {
        return {
          category: category,
          section: _.trim($('a', section).text()),
          url: url.resolve(baseUrl, u),
          name: name
        };
      }
    }
  }).get();
  secitons = _.uniqBy(secitons, 'url');
  console.log(`total ${secitons.length} faqs`);
  async.mapLimit(secitons, CONCURRENCY, fetchFAQ, function (err, faqs) {
    const toc = genToC(faqs);
    const content = _.join(_.map(faqs, function (f) {
      return `<h1 id="section-${f.name}">${f.section}</h1>${f.content}`;
    }), '');
    fs.writeFile(`index.html`, `<!DOCTYPE html><html><head></head><body><nav>${toc}</nav>${content}</body></html>`, function (err) {
      if (err) console.error(err);
      console.log('done!');
    });
  });
});

function fetchFAQ (section, done) {
  getPage(section.url, function ($) {
    let content = '';
    const name = section.name;
    let sectionSelector = 'h2';
    if (name === 'quicksight') {
      sectionSelector = 'section';
    } else if (_.includes(['windows', 'iot', 'ses', 'swf', 'config', 'elasticsearch-service'], name)) {
      sectionSelector = 'h3';
    }
    $(sectionSelector).each(function () {
      $(this).attr('id', name + '-' + $(this).attr('id'));
    });

    $('.parsys > .mbox').remove();
    $('script').remove(); // remove js
    if ($('.parsys > .columnbuilder .parsys.col1 > :not(.columnbuilder)')) {
      content += $('.parsys > .columnbuilder .parsys.col1').html();
    }
    $('.parsys > .columnbuilder').remove();

    if (name === 'windows') {
      $('main > section .parsys > .divider').first().prevAll().remove(); // remove in-page toc
    }

    $('a[href="#top"]').closest('.aws-text-box').remove(); // remove back to top

    if (name === 'console') { // tabs
      $('.par.parsys > .title-wrapper + .aws-text-box').remove(); // remove toc in each tab
      content += $('.tab-pane .par.parsys').map(function () {
        return $(this).html();
      }).get().join('');
    } else if (name === 'iam' || name === 'kms') { // Security & Identity
      content += $('main > section .row-builder:last-child .parsys').html();
    } else if (name === 'lumberyard' || name === 'gamelift') { // Game Development
      content += $('main > section .content > .row-builder:first-child .parsys').html();
    } else if (name === 'quicksight') {
      content += $('.central-column > .col-text').html();
    } else if (name === 'ses') {
      content += $('.parsys.content .parsys.col1').html();
    } else {
      content += $('main > section > .parsys').html();
    }

    section.content = content;
    done(null, section);
  });
}

function genToC (faqs) {
  const toc = _.join(_.map(faqs, function (faq) {
    if (!faq.content) console.log(faq);
    let $ = cheerio.load(faq.content);
    let sectionSelector = 'h2';
    let titleSelector = 'a';
    const name = faq.name;
    if (name === 'quicksight') {
      sectionSelector = 'section';
      titleSelector = 'h2';
    } else if (_.includes(['windows', 'iot', 'ses', 'swf', 'config', 'elasticsearch-service'], name)) {
      sectionSelector = 'h3';
    }
    let links = $(sectionSelector).map(function () {
      const id = $(this).attr('id');
      const title = _.trim($(titleSelector, this).html());
      return `<li><a href="#${id}">${title}</a></li>`;
    }).get().join('');
    return `<li><a href="#section-${name}">${faq.section}</a><ul>${links}</ul></li>`;
  }), '');
  return `<ul>${toc}</ul>`;
}
