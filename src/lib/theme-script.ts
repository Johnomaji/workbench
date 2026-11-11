/** localStorage key for the theme choice ("light" | "dark"; absent = match the device). */
export const THEME_STORAGE_KEY = "theme";

/**
 * Runs in <head> before first paint so a saved theme never flashes.
 * Plain module (not "use client") so the root layout can inline it.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
