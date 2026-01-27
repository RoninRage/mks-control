import { boot } from 'quasar/wrappers';
import { setCssVar } from 'quasar';

export default boot(() => {
  // Set brand colors programmatically for runtime theming
  setCssVar('primary', '#111111');
  setCssVar('secondary', '#FFFFFF');
  setCssVar('accent', '#2D2D2D');
  setCssVar('dark', '#0B0B0C');
  setCssVar('positive', '#1F7A4D');
  setCssVar('negative', '#B42318');
  setCssVar('info', '#1B4DFF');
  setCssVar('warning', '#B25E00');
});
