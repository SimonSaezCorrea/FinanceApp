/**
 * Texts of the emails (specs/032), Spanish. Same keys as `en.ts` (enforced by a parity test).
 * `{name}` placeholders are filled by the templates, always HTML-escaped. No email ever carries
 * financial data (FR-026).
 */
export const es = {
  layout: {
    footer: "Este es un correo automático de mifik. No respondas a esta dirección.",
    contact: "¿Dudas? Escríbenos a {contact}.",
    buttonFallback: "Si el botón no funciona, copia este enlace en tu navegador:",
  },
  verifyEmail: {
    subject: "Confirma tu correo en mifik",
    preheader: "Un clic para confirmar que esta dirección es tuya.",
    title: "Confirma tu correo",
    body: "Toca el botón para confirmar que {address} es tu correo. Así podrás recuperar tu cuenta si olvidas tu contraseña y te avisaremos de cambios importantes.",
    button: "Confirmar mi correo",
    expires: "El enlace vence en 48 horas y sirve una sola vez.",
    ignore: "Si no pediste esto, ignora este correo: no se hará ningún cambio.",
  },
  resetPassword: {
    subject: "Elige una contraseña nueva para mifik",
    preheader: "Pediste recuperar el acceso a tu cuenta.",
    title: "Recupera tu cuenta",
    body: "Recibimos un pedido para recuperar el acceso a tu cuenta de mifik. Toca el botón para elegir una contraseña nueva.",
    button: "Elegir contraseña nueva",
    expires: "El enlace vence en 30 minutos y sirve una sola vez.",
    sessions:
      "Al cambiarla se cerrarán todas tus sesiones abiertas. Si tienes la verificación en dos pasos, te la seguiremos pidiendo.",
    ignore: "Si no lo pediste, ignora este correo: tu contraseña no cambia.",
  },
  mfaCode: {
    preheader: "Tu código vence en 10 minutos.",
    expires: "Vence en 10 minutos y sirve una sola vez.",
    neverAsk: "Nadie de mifik te pedirá este código: no lo compartas con nadie.",
    ignore: "Si no fuiste tú, ignora este correo y cambia tu contraseña.",
    purposes: {
      LOGIN: {
        subject: "Tu código para entrar a mifik",
        title: "Código para entrar",
        body: "Alguien ingresó tu contraseña de mifik. Para terminar de entrar, escribe este código:",
      },
      ENROLL: {
        subject: "Tu código para activar la verificación por correo en mifik",
        title: "Confirma la verificación por correo",
        body: "Para que tu cuenta de mifik pida un código enviado a este correo al entrar, escribe este código en tu perfil:",
      },
      STEP_UP: {
        subject: "Tu código para confirmar que eres tú en mifik",
        title: "Confirma que eres tú",
        body: "Para continuar con un cambio de seguridad en tu cuenta de mifik, escribe este código:",
      },
    },
  },
  securityNotice: {
    verifiedModel: "Modelo verificado con el catálogo de la FIDO Alliance: {model}.",
    when: "Cuándo: {date} (hora de Chile).",
    notYou:
      "¿No fuiste tú? Recupera tu contraseña desde el acceso de mifik ({site}) y escríbenos a {contact}.",
    kinds: {
      PASSWORD_CHANGED: {
        subject: "Cambió la contraseña de tu cuenta de mifik",
        title: "Tu contraseña cambió",
        body: "La contraseña de tu cuenta de mifik se cambió desde tu perfil. Las demás sesiones abiertas se cerraron.",
      },
      PASSWORD_RESET: {
        subject: "Recuperaste el acceso a tu cuenta de mifik",
        title: "Elegiste una contraseña nueva",
        body: "Se eligió una contraseña nueva para tu cuenta de mifik usando un enlace de recuperación. Todas las sesiones abiertas se cerraron.",
      },
      MFA_ENABLED: {
        subject: "Activaste la verificación en dos pasos en mifik",
        title: "Verificación en dos pasos activada",
        body: "Desde ahora, entrar a tu cuenta de mifik con contraseña también pide un código: el de tu app de autenticación o uno enviado a tu correo, según el método que elegiste.",
      },
      MFA_DISABLED: {
        subject: "Se desactivó la verificación en dos pasos en mifik",
        title: "Verificación en dos pasos desactivada",
        body: "Tu cuenta de mifik ya no pide un código al entrar con contraseña. Las demás sesiones abiertas se cerraron.",
      },
      PASSKEY_ADDED: {
        subject: "Agregaste una llave de acceso a mifik",
        title: "Nueva llave de acceso",
        body: "Se agregó la llave de acceso «{detail}» a tu cuenta de mifik. Con ella se puede entrar sin contraseña.",
      },
      PASSKEY_REMOVED: {
        subject: "Eliminaste una llave de acceso de mifik",
        title: "Llave de acceso eliminada",
        body: "Se eliminó la llave de acceso «{detail}» de tu cuenta de mifik.",
      },
      EMAIL_CHANGED: {
        subject: "Cambió el correo de tu cuenta de mifik",
        title: "Tu correo cambió",
        body: "El correo de tu cuenta de mifik ahora es {detail}. Esta dirección dejó de recibir nuestros correos y ya no sirve para recuperar la cuenta.",
      },
      EMAIL_CHANGE_REQUESTED: {
        subject: "Se pidió cambiar el correo de tu cuenta de mifik",
        title: "Se pidió cambiar tu correo",
        body: "Se pidió cambiar el correo de tu cuenta de mifik a {detail}. El cambio se hace solo si alguien abre el enlace que enviamos a esa dirección. Si no fuiste tú, cambia tu contraseña: eso cancela el cambio pendiente.",
      },
      IDENTIFIER_CHANGED: {
        subject: "Cambió el RUT de tu cuenta de mifik",
        title: "Tu RUT cambió",
        body: "El RUT con que entras a tu cuenta de mifik y recuperas tu contraseña se cambió desde tu perfil. Desde ahora debes usar el nuevo para entrar.",
      },
      RECOVERY_CODES_REGENERATED: {
        subject: "Generaste códigos de recuperación nuevos en mifik",
        title: "Códigos de recuperación nuevos",
        body: "Se generaron 10 códigos de recuperación nuevos para tu cuenta de mifik. Los anteriores ya no sirven. Los dispositivos que habías recordado volverán a pedir el código.",
      },
      TRUSTED_DEVICE_ADDED: {
        subject: "Recordaste un dispositivo en mifik",
        title: "Dispositivo recordado",
        body: "En «{detail}» no se volverá a pedir el código de verificación por 30 días al entrar con tu contraseña. Puedes quitarlo en Perfil → Seguridad.",
      },
      PASSKEY_COMPROMISED: {
        subject: "Una de tus llaves de acceso de mifik ya no es segura",
        title: "Llave de acceso comprometida",
        body: "El modelo de tu llave de acceso «{detail}» fue declarado comprometido por su fabricante o la FIDO Alliance. Desde ahora ya no sirve para entrar ni para confirmar tu identidad, y cerramos las sesiones que se abrieron con ella. Quítala desde Perfil → Seguridad y, si quieres, agrega otra.",
      },
      MFA_METHOD_CHANGED: {
        subject: "Cambiaste tu verificación en dos pasos en mifik",
        title: "Método de verificación cambiado",
        body: "Se cambió el método con que tu cuenta de mifik pide el segundo paso al entrar. Los dispositivos que habías recordado volverán a pedir el código.",
      },
      ACCOUNT_DELETED: {
        subject: "Eliminaste tu cuenta de mifik",
        title: "Tu cuenta fue eliminada",
        body: "Tu cuenta de mifik se eliminó a pedido tuyo. Ya no se puede entrar con ella.",
      },
    },
  },
};

export type EmailCatalog = typeof es;
