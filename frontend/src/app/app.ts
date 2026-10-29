import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Raíz: cada área (web pública, acceso, gestión, mi área) pone su propio marco. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />'
})
export class App {}
