import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/vue";
import App from "../src/App.vue"

describe("App login state", () => {
  test("renders login-card with form when no token", async () => {
    render(App, {
      props: { token: null }
    })

    // the form exists
    const form = await screen.findByRole("form")
    expect(form).toBeInTheDocument()

    // and is child of login-card
    expect(form.parentElement).toHaveClass("login-card")
  })
})
