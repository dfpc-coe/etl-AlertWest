import test from 'node:test';
import assert from 'node:assert';
import { text, number, flag, coordinates, epoch, imageTime, imageUrl } from '../lib/parse.js';

test('text', () => {
    assert.equal(text(' a '), 'a');
    assert.equal(text(''), null);
    assert.equal(text(null), null);
    assert.equal(text(2148), '2148');
});

test('number', () => {
    assert.equal(number('248.00'), 248);
    assert.equal(number(''), null);
    assert.equal(number(null), null);
    assert.equal(number('abc'), null);
});

test('flag', () => {
    assert.equal(flag(1), true);
    assert.equal(flag('1'), true);
    assert.equal(flag(true), true);
    assert.equal(flag(0), false);
    assert.equal(flag(null), false);
    assert.equal(flag(undefined), false);
});

test('coordinates', () => {
    assert.deepEqual(coordinates({ lat: '38.573868', lon: '-120.726982' }), [-120.726982, 38.573868]);
    assert.equal(coordinates({ lat: '0', lon: '0' }), null);
    assert.equal(coordinates({ lat: '91', lon: '0' }), null);
    assert.equal(coordinates({ lat: null, lon: '1' }), null);
});

test('epoch', () => {
    assert.equal(epoch(1792465512), '2026-10-20T03:05:12.000Z');
    assert.equal(epoch('1792465512'), '2026-10-20T03:05:12.000Z');
    assert.equal(epoch(0), null);
    assert.equal(epoch(null), null);
});

test('imageTime', () => {
    assert.equal(imageTime('Mt_Lewis_Tuolumne_1_1792466294_6462.jpg')?.toISOString(), '2026-10-20T03:18:14.000Z');
    assert.equal(imageTime('I-405_SR-73_1747256005_6235_s.jpg')?.toISOString(), '2025-05-14T20:53:25.000Z');
    assert.equal(imageTime(''), null);
    assert.equal(imageTime('nope.jpg'), null);
});

test('imageUrl', () => {
    assert.equal(
        imageUrl('2178', 'Mt_Lewis_Tuolumne_1_1792466294_6462.jpg'),
        'https://img.cdn.prod.alertwest.com/data/img/2178/2026/10/20/Mt_Lewis_Tuolumne_1_1792466294_6462.jpg'
    );
    // Date folders follow the UTC capture date
    assert.equal(
        imageUrl(1, 'Late_1736294001_8143_s.jpg'),
        'https://img.cdn.prod.alertwest.com/data/img/1/2025/01/07/Late_1736294001_8143_s.jpg'
    );
    assert.equal(imageUrl('1', ''), null);
    assert.equal(imageUrl('', 'Late_1736294001_8143_s.jpg'), null);
});
