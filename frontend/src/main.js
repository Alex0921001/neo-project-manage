import { createApp } from "vue";
import ElementPlus from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import "element-plus/dist/index.css";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import "./styles/ep-theme.css";
import App from "./App.vue";

// Element Plus 全量中文化（日期选择器等组件语言，P3）
dayjs.locale("zh-cn");

createApp(App).use(ElementPlus, { locale: zhCn }).mount("#app");
