<script setup lang="ts">
import { computed } from 'vue'
import { PlayIcon, PauseIcon, StopIcon } from '@heroicons/vue/20/solid'
import { music, musicTracks } from '@/arkham/bgm'
const groups = [...new Set(musicTracks.map(t => t.group))]
const chinese = (localStorage.getItem('language') ?? 'zh').startsWith('zh')
const text = (zh: string, en: string) => chinese ? zh : en
const volume = computed(() => Math.round(music.preferences.volume * 100))
</script>
<template>
  <section class="music-controls" :aria-label="text('背景音乐', 'Background music')">
    <h3>{{ text('背景音乐', 'Background music') }}</h3>
    <label>{{ text('曲目', 'Track') }}
      <select :value="music.preferences.overrides[music.scenario.value] ?? ''" :disabled="!music.scenario.value" @change="music.select(($event.target as HTMLSelectElement).value)">
        <option value="">{{ text('跟随剧本', 'Follow scenario') }}</option>
        <optgroup v-for="group in groups" :key="group" :label="group">
          <option v-for="track in musicTracks.filter(t => t.group === group)" :key="track.id" :value="track.id">{{ track.title }}</option>
        </optgroup>
      </select>
    </label>
    <output class="music-current">{{ music.track.value?.title ?? text('当前剧本未匹配音乐', 'No track assigned') }}</output>
    <div class="music-transport">
      <button type="button" :disabled="!music.track.value" :title="music.playing.value ? text('暂停', 'Pause') : text('播放', 'Play')" :aria-label="music.playing.value ? text('暂停', 'Pause') : text('播放', 'Play')" @click="music.playing.value ? music.pause() : music.play()"><PauseIcon v-if="music.playing.value" /><PlayIcon v-else /></button>
      <button type="button" :disabled="!music.track.value" :title="text('停止', 'Stop')" :aria-label="text('停止', 'Stop')" @click="music.stop()"><StopIcon /></button>
      <label><input v-model="music.preferences.autoplay" type="checkbox" />{{ text('自动播放', 'Autoplay') }}</label>
      <label><input v-model="music.preferences.loop" type="checkbox" />{{ text('循环', 'Loop') }}</label>
    </div>
    <label>{{ text('音乐音量', 'Music volume') }} <input v-model.number="music.preferences.volume" type="range" min="0" max="1" step="0.01" /> <output>{{ volume }}%</output></label>
    <p v-if="music.error.value" role="status">{{ music.error.value === 'blocked' ? text('浏览器暂停了自动播放，请点击播放。', 'Autoplay blocked. Press Play to begin.') : text('音乐加载失败，请重试或选择其他曲目。', 'Unable to load audio. Retry or select another track.') }}</p>
  </section>
</template>
<style scoped>
.music-controls { color: #eee8d8; padding: 4px 0 14px; margin-bottom: 12px; border-bottom: 1px solid #8c988c; }
.music-controls h3 { margin: 0 0 10px; color: inherit; font-size: 16px; }
.music-controls label { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.music-controls select { flex: 1; min-width: 0; max-width: 100%; color: #eee8d8; background: #203b32; border: 1px solid #8c988c; border-radius: 4px; padding: 6px; }
.music-current { display: block; margin: 8px 0; overflow-wrap: anywhere; font-size: 13px; }
.music-transport { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.music-transport button { width: 36px; height: 36px; padding: 7px; color: #eee8d8; background: #203b32; border: 1px solid #8c988c; border-radius: 4px; }
.music-transport svg { width: 20px; height: 20px; }
.music-controls input[type=range] { flex: 1; min-width: 40px; }
.music-controls output { white-space: normal; }
.music-controls p { color: #ffd9a1; font-size: 13px; }
</style>
