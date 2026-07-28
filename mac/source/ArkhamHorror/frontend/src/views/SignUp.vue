<script lang="ts" setup>
import { ref, reactive } from 'vue'
import { useUserStore } from '@/stores/user'
import { useRoute, useRouter } from 'vue-router'
import type { Registration } from '@/types'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const router = useRouter()
const store = useUserStore()
const registration = reactive<Registration>({
  username: '',
  email: '',
  password: '',
})
const signUpError = ref<string|null>(null)
const verificationCode = ref('')
const awaitingVerification = ref(false)
const onlineMode = import.meta.env.VITE_ONLINE_MODE === 'true'

const { t } = useI18n()

async function register() {
  signUpError.value = null
  try {
    const result = await store.register(registration)
    if (onlineMode && 'verificationRequired' in result) {
      awaitingVerification.value = true
      return
    }
    finishRegistration()
  } catch (error: any) {
    signUpError.value = error?.response?.data?.message ?? t("usernameOrEmailAlreadyTaken")
  }
}

async function verify() {
  signUpError.value = null
  try {
    await store.verifyRegistration(registration.email, verificationCode.value)
    finishRegistration()
  } catch (error: any) {
    signUpError.value = error?.response?.data?.message ?? t('verificationCodeInvalid')
  }
}

function finishRegistration() {
  const { nextUrl } = route.query
  if (nextUrl) {
    router.push({ path: nextUrl as string })
  } else {
    router.push({ path: '/' })
  }
}
</script>

<template>
  <form @submit.prevent="awaitingVerification ? verify() : register()">
    <header><i class="secret"></i></header>
    <section>
      <div>
        <input
          v-model="registration.username"
          type="text"
          :placeholder="$t('username')"
          :disabled="awaitingVerification"
        />
      </div>
      <div>
        <input
          v-model="registration.email"
          type="email"
          :placeholder="$t('email')"
          :disabled="awaitingVerification"
        />
      </div>
      <div>
        <input
          v-model="registration.password"
          type="password"
          :placeholder="$t('password')"
          :disabled="awaitingVerification"
        />
      </div>
      <div v-if="awaitingVerification">
        <p class="verification-help">{{ $t('verificationCodeSent') }}</p>
        <input
          v-model="verificationCode"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          :placeholder="$t('verificationCode')"
        />
      </div>
      <p v-if="signUpError" class="error">{{ signUpError }}</p>
      <div>
        <button>{{ awaitingVerification ? $t('verifyEmail') : $t('register') }}</button>
      </div>
      <button
        v-if="awaitingVerification"
        class="secondary"
        type="button"
        @click="register"
      >
        {{ $t('resendVerificationCode') }}
      </button>
    </section>
  </form>
</template>

<style scoped>
form {
  margin: 0 auto;
  margin-top: 10vh;
  width: 50vw;
  max-width: 400px;
}

section {
  border-radius: 3px;
  padding: 10px;
}

header {
  text-align: center;
}

input {
  outline: 0;
  border: 0;
  padding: 15px;
  background: var(--background-dark);
  width: 100%;
  margin-bottom: 10px;
}

button {
  outline: 0;
  padding: 15px;
  background: var(--button-1);
  text-transform: uppercase;
  color: white;
  border: 0;
  width: 100%;
  &:hover {
      background: hsl(80, 35%, 32%);
  }
}

button.secondary {
  margin-top: 8px;
  background: var(--background-dark);
}

.verification-help {
  margin: 0 0 10px;
}

.error {
  color: var(--danger);
}

i.secret {
  font-family: 'Arkham';
  font-style: normal;
  font-weight: normal;
  font-variant: normal;
  text-transform: none;
  line-height: 1;
  font-size: 5em;
  color: #15192C;
  -webkit-font-smoothing: antialiased;
  position: relative;

  &:before {
    font-family: "Arkham";
    content: "\0048";
  }
}
</style>
