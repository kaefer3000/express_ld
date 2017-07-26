# express_ld
Simple storage for linked data resources. Uses [express](http://expressjs.com), [rdflib.js](https://github.com/linkeddata/rdflib.js), and [jsonld.js](https://github.com/digitalbazaar/jsonld.js/).

Requires [Node.js](https://nodejs.org/en/download/) with npm (build and tested on Node.js Version 8).

## Install
- clone repo
- cd into it
- `npm i`

## Usage
- `npm start`

## Examples
### Enumerate items
`curl -Haccept:text/turtle http://localhost:8080`

returns (without any objects in the container):

    @prefix : <#>.
    @prefix n0: <http://>.
    @prefix ldp: <http://www.w3.org/ns/ldp#>.

    n0:localhost a ldp:BasicContainer.

### Delete all items
`curl -X DELETE http://localhost:8080/`

### Post item (or Put if your are crazy)
`curl -X POST http://localhost:8080/ -Hcontent-type:text/turtle --data-binary ' _:x <http://schema.org/text> "First!!1!" .'`
`curl -X POST http://localhost:8080/ -Hcontent-type:text/turtle --data-binary ' _:x <http://schema.org/image> <http://example.org/pic/of/your/mother.jpg> .'`
