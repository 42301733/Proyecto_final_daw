// Elementos del formulario que se usan para leer la búsqueda y mostrar avisos.
const formBusqueda = document.getElementById("formBusqueda");
const entradaBusqueda = document.getElementById("cadenaBusqueda");
const mensajeAviso = document.getElementById("errorBusqueda");

// La sección contiene el espacio donde se insertan las fichas de las obras.
const bloqueResultados = document.getElementById("seccion-respuestas");
const listaObras = document.getElementById("obrasArte");
const btnEnviar = formBusqueda.querySelector('button[type="submit"]');


// Dirección base a la que se agrega el criterio de cada búsqueda.
const endpointObras = "https://nearness-cyclist-debtor.ngrok-free.dev/pf/obras/index.php";

const mapaImagenesLocales = {};

function limpiarTextoComparacion(cadena) {
    return (cadena ?? "")
        .toString()
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "");
}

function armarUrlApi(ruta) {
    if (!ruta) return "";
    const limpia = ruta.toString().trim().replace(/^\/+/, "");
    const urlFinal = new URL(limpia, endpointObras);
    return urlFinal.protocol === "http:" || urlFinal.protocol === "https:" ? urlFinal.href : "";
}

function resolverRutasImagen(obraActual) {
    const remota = armarUrlApi(obraActual.imagen);
    const llave = limpiarTextoComparacion(obraActual.titulo);
    const archivoLocal = mapaImagenesLocales[llave];

    if (!archivoLocal) {
        return { principal: remota, respaldo: "" };
    }

    const rutaRelativa = archivoLocal.toString().trim().replace(/^\/+/, "");
    return {
        principal: new URL(rutaRelativa, location.href).href,
        respaldo: remota
    };
}

// El envío del formulario llama a ejecutarBusqueda, incluso si se hace con Enter.
formBusqueda.addEventListener("submit", ejecutarBusqueda);

async function ejecutarBusqueda(evento) {
    // Se cancela el envío normal para actualizar los resultados en la misma página.
    evento.preventDefault();

    const textoBuscado = entradaBusqueda.value.trim();
    mensajeAviso.textContent = "";

    // Si el campo queda vacío después de quitar los espacios, se muestra un aviso.
    if (!textoBuscado) {
        mensajeAviso.textContent = "Proporciona la cadena de búsqueda.";
        entradaBusqueda.focus();
        return;
    }

    // El radio seleccionado indica qué parámetro recibe la API.
    const opcionMarcada = formBusqueda.querySelector('input[name="criterio"]:checked');
    const campoFiltro = opcionMarcada.value;
    const urlPeticion = new URL(endpointObras);
    urlPeticion.searchParams.set(campoFiltro, textoBuscado);

    // Se retiran las fichas anteriores y se desactiva Buscar mientras responde la API.
    bloqueResultados.hidden = true;
    listaObras.innerHTML = "";
    btnEnviar.disabled = true;

    // La promesa entrega los datos de la petición GET o informa por qué falló.
    const peticionObras = new Promise(function (cumplir, fallar) {
        const xhrObras = new XMLHttpRequest();

        xhrObras.open("GET", urlPeticion.href);
        xhrObras.setRequestHeader("ngrok-skip-browser-warning", "true");
        xhrObras.timeout = 15000;

        // Si el estado HTTP indica éxito, se intenta convertir la respuesta JSON.
        xhrObras.onload = function () {
            if (xhrObras.status >= 200 && xhrObras.status < 300) {
                try {
                    cumplir(JSON.parse(xhrObras.responseText));
                } catch {
                    fallar(new Error("La respuesta JSON no es válida."));
                }
            } else {
                fallar(new Error("Error HTTP " + xhrObras.status));
            }
        };

        // Estos eventos cubren los fallos de conexión y el límite de 15 segundos.
        xhrObras.onerror = function () {
            fallar(new Error("Error de red o CORS."));
        };

        xhrObras.ontimeout = function () {
            fallar(new Error("La API tardó demasiado en responder."));
        };

        xhrObras.send();
    });

    // En esta cadena se acumula el HTML de todas las fichas.
    let htmlTarjetas = "";

    try {
        // await espera los datos antes de comprobar si la respuesta es un arreglo.
        const catalogoRecibido = await peticionObras;

        if (!Array.isArray(catalogoRecibido)) {
            throw new Error("La API no devolvió un arreglo de obras.");
        }
        const filtroNormalizado = limpiarTextoComparacion(textoBuscado);
        /**/
        const obrasFiltradas = catalogoRecibido.filter((pieza) => {
            if (campoFiltro === "id") {
                return limpiarTextoComparacion(pieza.titulo).includes(filtroNormalizado)
                    || limpiarTextoComparacion(pieza.id).includes(filtroNormalizado);
            }
            if (campoFiltro === "idPintura") {
                return limpiarTextoComparacion(pieza.tipo).includes(filtroNormalizado);
            }
            if (campoFiltro === "idAño") {
                return limpiarTextoComparacion(pieza.anio).includes(filtroNormalizado);
            }
            if (campoFiltro === "idMovimiento") {
                return limpiarTextoComparacion(pieza.movimiento).includes(filtroNormalizado);
            }
            return true;
        });

        // Un arreglo vacío indica que la consulta terminó sin coincidencias.
        if (obrasFiltradas.length === 0) {
            mensajeAviso.textContent = "No se encontraron obras para esa búsqueda.";
            return;
        }

        // Un arreglo vacío indica que la consulta terminó sin coincidencias.
        if (catalogoRecibido.length === 0) {
            mensajeAviso.textContent = "No se encontraron obras para esa búsqueda.";
            return;
        }

        // Se escapan los caracteres especiales para mostrar los datos como texto al usar innerHTML.
        const escaparTexto = (dato) => String(dato ?? "—")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");

        // Cada obra agrega una ficha con su imagen y sus datos al HTML de salida.
        obrasFiltradas.forEach((pieza) => {
            const encabezadoObra = escaparTexto(pieza.titulo);
            const { principal, respaldo } = resolverRutasImagen(pieza);
            let bloqueImagen = "";

            if (principal) {
                // Evita reintentar la misma URL de respaldo si también falla.
                const eventoError = respaldo
                    ? `data-respaldo="${escaparTexto(respaldo)}" onerror="const urlAlterna=this.dataset.respaldo;if(urlAlterna){this.dataset.respaldo='';this.src=urlAlterna;}else{this.closest('.col-12.col-md-6').remove();}"`
                    : `onerror="this.closest('.col-12.col-md-6').remove();"`;

                bloqueImagen = `
                    <div class="col-12 col-md-6">
                        <img src="${escaparTexto(principal)}" class="img-fluid" alt="${encabezadoObra}" ${eventoError}>
                    </div>`;
            }

            // Desde el tamaño mediano, la imagen y los datos van lado a lado.
            // Si la ficha no incluye imagen, los datos ocupan todo su ancho.
            const columnasTexto = bloqueImagen ? "col-12 col-md-6" : "col-12";

            htmlTarjetas += `
                <div class="col-12 col-md-6">
                    <article class="obra-resultado h-100">
                        <div class="row g-3">
                            ${bloqueImagen}
                            <div class="${columnasTexto}">
                                <h3>${encabezadoObra}</h3>
                                <p>${escaparTexto(pieza.descripcion)}</p>
                                <p>Artista: ${escaparTexto(pieza.artista)}</p>
                                <p>Año: ${escaparTexto(pieza.anio)}</p>
                                <p>Tipo: ${escaparTexto(pieza.tipo)}</p>
                                <p>Movimiento: ${escaparTexto(pieza.movimiento)}</p>
                            </div>
                        </div>
                    </article>
                </div>`;
        });

        // Se insertan todas las fichas juntas y se hace visible la sección de resultados.
        listaObras.innerHTML = htmlTarjetas;
        bloqueResultados.hidden = false;
    } catch (fallo) {
        // La página muestra un aviso breve y la consola conserva el detalle del error.
        console.error(fallo);
        mensajeAviso.textContent = "Error en la búsqueda.";
    } finally {
        // Buscar vuelve a habilitarse aunque falle la petición o no haya coincidencias.
        btnEnviar.disabled = false;
    }
}