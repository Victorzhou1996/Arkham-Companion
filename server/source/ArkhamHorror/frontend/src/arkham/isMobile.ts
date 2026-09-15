import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useMobileBoard } from '@/arkham/mobile/context';

export function IsMobile() {
  const board = useMobileBoard();
  const isMobile = ref(false);

  function updateIsMobile() {
    isMobile.value = window.innerWidth <= 800;
  }

  onMounted(() => {
    updateIsMobile();
    window.addEventListener('resize', updateIsMobile);
  });

  onUnmounted(() => {
    window.removeEventListener('resize', updateIsMobile);
  });

  // New board owns gestures/layout. Keep the shared entities' ordinary action
  // buttons and hand; legacy mobile menus implemented a conflicting two-tap flow.
  return { isMobile: computed(() => board?.touchEnabled.value ? false : isMobile.value) };
}
