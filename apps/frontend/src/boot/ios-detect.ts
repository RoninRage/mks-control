import { boot } from 'quasar/wrappers';

const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

export default boot(({ router }) => {
  if (isIOS) {
    void router.replace('/ios-fehler');
  }
});
