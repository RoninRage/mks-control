<template>
  <q-page class="flex flex-center">
    <div class="column items-center q-gutter-md">
      <div class="text-h2">MKS Control</div>
      <div class="text-h5 text-grey-7">
        Welcome to your Quasar Application
      </div>

      <q-btn
        color="primary"
        label="Get Started"
        icon="arrow_forward"
        to="/about"
        size="lg"
      />

      <div class="q-mt-xl">
        <q-card flat bordered class="q-pa-md">
          <q-card-section>
            <div class="text-h6">Quick Links</div>
          </q-card-section>

          <q-card-section class="q-pt-none">
            <div class="column q-gutter-sm">
              <q-btn
                flat
                color="primary"
                label="Quasar Documentation"
                icon="school"
                href="https://quasar.dev"
                target="_blank"
              />
              <q-btn
                flat
                color="primary"
                label="Vue 3 Documentation"
                icon="school"
                href="https://vuejs.org"
                target="_blank"
              />
              <q-btn
                flat
                color="primary"
                label="GitHub Repository"
                icon="code"
                href="https://github.com"
                target="_blank"
              />
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
defineOptions({
  name: 'IndexPage',
});
</script>
