<template>
  <div class="ios-error" role="alert">
    <h1>Kauf ein echtes Telefon</h1>
    <p>[iOS not supported]</p>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'IosErrorPage' });
</script>

<style scoped lang="scss">
.ios-error {
  position: fixed;
  inset: 0;
  background: #c62828;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem;

  h1 {
    font-family: 'Share Tech Mono', 'Courier New', monospace;
    font-size: clamp(2rem, 8vw, 3.5rem);
    font-weight: bold;
    color: #fff;
    line-height: 1.2;
    margin-bottom: 1rem;
  }

  p {
    font-family: 'Share Tech Mono', 'Courier New', monospace;
    font-size: 1.25rem;
    color: #ffcdd2;
  }
}
</style>
