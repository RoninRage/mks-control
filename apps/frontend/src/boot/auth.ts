import { boot } from 'quasar/wrappers';
import {
  authEventSource,
  HeartbeatEvent,
  ReaderEvent,
  TagEvent,
} from 'src/services/authEventSource';
import { useAuthStore } from 'src/stores/auth';

export default boot(() => {
  const store = useAuthStore();

  authEventSource.onTag((event: TagEvent): void => {
    store.unlock(event);
  });

  authEventSource.onReader((event: ReaderEvent): void => {
    store.setReaderStatus(event);
  });

  authEventSource.onHeartbeat((event: HeartbeatEvent): void => {
    store.setHeartbeat(event);
  });

  authEventSource.connect();
});
