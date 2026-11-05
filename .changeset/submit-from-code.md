---
'vael-form': patch
---

`handleSubmit` called from code, with no submit event (from a TanStack Query `mutationFn`, a button's `@click`), focuses the first invalid field too. It finds the field by its id, or by the error id in its `aria-describedby` when a component library gives the input its own id. The README has a section on pairing a form with TanStack Query.
