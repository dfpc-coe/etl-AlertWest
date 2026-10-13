import test from 'node:test';
import assert from 'node:assert';
import { text, number, coordinates, timestamp, bearing, distance, viewLine } from '../lib/parse.js';

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

test('coordinates', () => {
    assert.deepEqual(coordinates({ latitude: '38.573868', longitude: '-120.726982' }), [-120.726982, 38.573868]);
    assert.equal(coordinates({ latitude: '0', longitude: '0' }), null);
    assert.equal(coordinates({ latitude: '91', longitude: '0' }), null);
    assert.equal(coordinates({ latitude: null, longitude: '1' }), null);
});

test('timestamp', () => {
    assert.equal(timestamp('2025-12-10T20:35:56Z'), '2025-12-10T20:35:56.000Z');
    assert.equal(timestamp('nope'), null);
    assert.equal(timestamp(null), null);
});

test('bearing & distance', () => {
    assert.equal(Math.round(bearing([0, 0], [0, 1])), 0);
    assert.equal(Math.round(bearing([0, 0], [1, 0])), 90);
    assert.equal(Math.round(bearing([0, 0], [0, -1])), 180);
    assert.equal(Math.round(bearing([0, 0], [-1, 0])), 270);

    assert.equal(Math.round(distance([0, 0], [0, 1]) / 1000), 111);
});

test('viewLine', () => {
    assert.deepEqual(viewLine('38.573868,-120.726982 38.568436,-120.744104'), [
        [-120.726982, 38.573868],
        [-120.744104, 38.568436]
    ]);
    assert.deepEqual(viewLine(null), []);
    assert.deepEqual(viewLine('garbage'), []);
});
