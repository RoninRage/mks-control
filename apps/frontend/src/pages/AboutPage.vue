<template>
  <q-page class="ms-container">
    <!-- Header -->
    <div class="ms-section">
      <div class="row items-center justify-between q-mb-lg">
        <div>
          <h1 class="text-h3 q-mb-sm">Über MKS Control</h1>
          <p class="text-body1 ms-muted">Ein modernes RFID-Steuerungssystem für MakerSpaces</p>
        </div>
        <q-btn
          flat
          icon="arrow_back"
          color="primary"
          @click="goBack"
          size="lg"
          padding="md"
          min-width="48px"
          min-height="48px"
          aria-label="Go back"
        />
      </div>
    </div>

    <div class="ms-section">
      <q-card flat bordered>
        <q-card-section>
          <div class="text-h6 q-mb-md">Benutzerrechte-Hierarchie</div>
          <p class="text-body1 q-mb-md">
            Das System verwendet eine rollenbasierte Zugriffskontrolle mit folgender Hierarchie:
          </p>
        </q-card-section>

        <q-card-section>
          <q-list>
            <q-item>
              <q-item-section avatar>
                <div class="role-icon-wrapper">
                  <role-icon role-id="admin" />
                </div>
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-weight-bold">Admin</q-item-label>
                <q-item-label caption class="ms-muted">
                  Volle Systemberechtigung - kann alle Funktionen nutzen, Mitglieder verwalten und
                  andere Administratoren löschen
                </q-item-label>
              </q-item-section>
            </q-item>

            <q-item>
              <q-item-section avatar>
                <div class="role-icon-wrapper">
                  <role-icon role-id="vorstand" />
                </div>
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-weight-bold">Vorstand</q-item-label>
                <q-item-label caption class="ms-muted">
                  Erweiterte Berechtigungen für Vorstandsmitglieder - kann wichtige Entscheidungen
                  treffen
                </q-item-label>
              </q-item-section>
            </q-item>

            <q-item>
              <q-item-section avatar>
                <div class="role-icon-wrapper">
                  <role-icon role-id="bereichsleitung" />
                </div>
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-weight-bold">Bereichsleitung</q-item-label>
                <q-item-label caption class="ms-muted">
                  Verantwortlich für spezifische Bereiche - kann Bereiche und Ausrüstung verwalten
                </q-item-label>
              </q-item-section>
            </q-item>

            <q-item>
              <q-item-section avatar>
                <div class="role-icon-wrapper">
                  <role-icon role-id="mitglied" />
                </div>
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-weight-bold">Mitglied</q-item-label>
                <q-item-label caption class="ms-muted">
                  Standardzugriff - kann Geräte nutzen und auf grundlegende Funktionen zugreifen
                </q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>

        <q-card-section>
          <q-banner class="bg-info text-white" rounded>
            <template #avatar>
              <q-icon name="info" />
            </template>
            Benutzer können mehrere Rollen gleichzeitig haben. Die höchste Rolle bestimmt die
            Gesamtberechtigungen.
          </q-banner>
        </q-card-section>
      </q-card>
    </div>

    <div class="ms-section">
      <q-card flat bordered>
        <q-card-section>
          <div class="text-h6 q-mb-md">Systemstruktur</div>
          <p class="text-body1 q-mb-md">
            Das System organisiert Zugriff und Ressourcen durch die Beziehung zwischen Bereichen,
            Ausstattung und Benutzergruppen:
          </p>
        </q-card-section>

        <q-card-section>
          <div class="system-diagram">
            <!-- Areas -->
            <div class="diagram-box">
              <div class="diagram-icon">
                <q-icon name="category" size="32px" />
              </div>
              <div class="diagram-label">Bereiche</div>
              <div class="diagram-description">Physische Räume oder Zonen im MakerSpace</div>
            </div>

            <!-- Arrow -->
            <div class="diagram-arrow">
              <q-icon name="arrow_forward" size="24px" />
              <span class="arrow-label">enthalten</span>
            </div>

            <!-- Equipment -->
            <div class="diagram-box">
              <div class="diagram-icon">
                <q-icon name="build" size="32px" />
              </div>
              <div class="diagram-label">Ausstattung</div>
              <div class="diagram-description">Geräte und Ausrüstung im Bereich</div>
            </div>

            <!-- Arrow Down -->
            <div class="diagram-arrow-vertical">
              <q-icon name="arrow_downward" size="24px" />
              <span class="arrow-label">Zugriff durch</span>
            </div>

            <!-- User Groups -->
            <div class="diagram-box diagram-box--wide">
              <div class="diagram-icon">
                <q-icon name="groups" size="32px" />
              </div>
              <div class="diagram-label">Benutzergruppen</div>
              <div class="diagram-description">
                Rollen definieren Zugriff auf Bereiche und Ausstattung
              </div>
              <div class="user-groups-list q-mt-sm">
                <q-chip size="sm" outline>Admin</q-chip>
                <q-chip size="sm" outline>Vorstand</q-chip>
                <q-chip size="sm" outline>Bereichsleitung</q-chip>
                <q-chip size="sm" outline>Mitglied</q-chip>
              </div>
            </div>
          </div>
        </q-card-section>

        <q-card-section>
          <q-banner class="bg-info text-white" rounded>
            <template #avatar>
              <q-icon name="info" />
            </template>
            Bereichsleitungen können spezifische Bereiche verwalten, während Admins Zugriff auf alle
            Bereiche und Ausstattung haben.
          </q-banner>
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import RoleIcon from 'components/RoleIcon.vue';

defineOptions({
  name: 'AboutPage',
});

const router = useRouter();

function goBack() {
  router.replace('/dashboard');
}
</script>

<style scoped lang="scss">
.action-button {
  min-height: 44px;
  min-width: 44px;
  padding: 8px 24px;
}

.role-icon-wrapper {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.system-diagram {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 32px 16px;
  background: var(--ms-background);
  border-radius: 12px;
  border: 1px solid var(--ms-border);
}

.diagram-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px;
  background: var(--ms-card-background);
  border: 2px solid var(--ms-border);
  border-radius: 12px;
  min-width: 240px;
  text-align: center;
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  &--wide {
    min-width: 320px;
  }
}

body.body--dark .diagram-box:hover {
  box-shadow: 0 4px 12px rgba(255, 255, 255, 0.1);
}

.diagram-icon {
  margin-bottom: 12px;
  color: var(--ms-text-primary);
}

.diagram-label {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--ms-text-primary);
}

.diagram-description {
  font-size: 14px;
  color: var(--ms-text-muted);
  line-height: 1.4;
}

.diagram-arrow,
.diagram-arrow-vertical {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ms-text-muted);
}

.diagram-arrow-vertical {
  flex-direction: column;
}

.arrow-label {
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.user-groups-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

@media (min-width: 768px) {
  .system-diagram {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
  }

  .diagram-arrow {
    margin: 0 16px;
  }

  .diagram-arrow-vertical {
    flex-basis: 100%;
  }
}
</style>
