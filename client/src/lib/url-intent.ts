// Intention passée par l'URL depuis un raccourci (ex. « Nouveau rendez-vous » du
// tableau de bord → /#/app/agenda?new=1). Avec useHashLocation, wouter range la
// query dans location.search : on la lit une fois puis on l'efface, sinon elle
// survivrait aux navigations suivantes.
export function consumeNewIntent(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("new") !== "1") return false;
  params.delete("new");
  const search = params.toString();
  const url = window.location.pathname + (search ? `?${search}` : "") + window.location.hash;
  window.history.replaceState(window.history.state, "", url);
  return true;
}
