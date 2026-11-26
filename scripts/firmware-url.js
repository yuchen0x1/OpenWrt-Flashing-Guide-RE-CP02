'use strict';

function parseOfficialDownloadUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'downloads.openwrt.org'
      || url.username || url.password || url.port || url.search || url.hash) {
    throw new Error('Official firmware URL must use the OpenWrt HTTPS download host without credentials or parameters');
  }
  const parts = url.pathname.split('/');
  const version = parts[2];
  if (parts.length !== 7 || parts[1] !== 'releases' || !/^\d+\.\d+\.\d+$/.test(version || '')
      || parts[3] !== 'targets' || parts[4] !== 'ramips' || parts[5] !== 'mt7621') {
    throw new Error('Official firmware URL has an invalid release or target path');
  }
  const prefix = 'openwrt-' + version + '-ramips-mt7621-jdcloud_re-cp-02-';
  const kinds = ['squashfs-sysupgrade', 'initramfs-kernel'];
  const kind = kinds.find(candidate => parts[6] === prefix + candidate + '.bin');
  if (!kind) throw new Error('Official firmware URL has an invalid device, version or image purpose');
  return { version, kind };
}

module.exports = { parseOfficialDownloadUrl };
