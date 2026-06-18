// esbuild 入口：把 Milkdown Crepe(Notion 式所见即所得 md 编辑器) 打成单文件 vendor
// 构建：npm run build:milkdown  → 产物 public/vendor/milkdown/milkdown.js + .css（运行时无构建）
import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

window.FanboxCrepe = { Crepe };
