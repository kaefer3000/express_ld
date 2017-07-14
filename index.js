const $rdf = require('rdflib');
const jsonld = require('jsonld');
const express = require('express');

/* Declare Express App and its port */
const app = express();
const httpPort = 3000;

/* Include body-parser middleware */
const bodyParser = require('body-parser');

/* Content-type contant for JSONLD and accept all*/
const JSONLD = "application/ld+json";
const ACCEPTALL = "*/*";

/* required RDF predefinitions */
const LDP = $rdf.Namespace("http://www.w3.org/ns/ldp#");
const RDF = $rdf.Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#");
const LDPCONTAINER = LDP('BasicContainer');
const RDFTYPE = RDF('type')

/* message store */
let messages = []

/* build RDF answers */
const buildRdf = (data, req, res) => {
    /* gets accept header */
    let serializationFormat = req.accepts()[0];
    let store = $rdf.graph()

    /* send error, if no serialization format is set */
    console.log(serializationFormat);
    if (!serializationFormat || serializationFormat == ACCEPTALL) {
        res.status(400).send("Set accept header, e.g. text/turtle application/rdf+xml application/ld+json");
    } else {
        let isJsonLd = false;

        /* build base url dynamically */
        const baseUrl = req.protocol + "://" + req.hostname;
        const base = $rdf.sym(baseUrl);
        const baseNs = $rdf.Namespace(baseUrl+req.path);

        /* if only one object is to be displayed */
        if (Array.isArray(data)) {
            /* add the type */
            store.add(base, RDFTYPE, LDPCONTAINER);

            /* inserts triples for each item of the store */
            if (data) {
                data.forEach(function (message, idx) {
                    store.add(base, LDP('contains'), baseNs(idx+1));
                });
            }
        } else {
            store.add(data);
        }
        

        /* jump through some hoops for JSON-LD */
        if (serializationFormat == JSONLD) {
            serializationFormat = 'application/nquads';
            isJsonLd = true;
        }

        /* serializes the data */
        $rdf.serialize(undefined, store, baseUrl, serializationFormat, (err, str) => {
            if (err) {
                res.status(400).send(err+"\nSet accept header to supported format, e.g. text/turtle application/rdf+xml application/ld+json");
            } else {
                /* use another transformation for JSON-LD */
                if (isJsonLd) {
                    jsonld.fromRDF(str, {format: 'application/nquads'}, function(err, doc) {
                        if (err) {
                            res.status(400).send(err);
                        } else {
                            res.send(doc);
                        }
                    });
                } else {
                    res.send(str)
                }
            }
        })
                }
            }

/**
* parse everything as text (and try to get the best out of the libs)
*/
app.use(bodyParser.text({ type: ACCEPTALL }))

/* returns an accordingly formatted response to the base object */
app.get('/', (req, res) => {
    buildRdf(messages, req, res);
})

/**
* needs to receive the document and format it
*/
app.get('/:id', (req, res) => {
    if (messages.length < req.params.id || req.params.id < 1) {
        res.status(404).send("No document found with id "+req.params.id);
    } else {
        buildRdf(messages[req.params.id-1], req, res)
        //res.send(req.params.id);
    }
})

/* does not support JSON-LD yet */
app.post('/', (req, res) => {
    let store = $rdf.graph();
    let mimeType = req.headers['content-type'];;

    let url = req.protocol + "://" + req.hostname;
    $rdf.parse(req.body, store, url, mimeType, (err, content) => {
        if(err) {
            res.status(400).send(err);
            console.log("err", err);
        } else {
            messages.push(content);
            res.send({
                success: true,
                storeSize: messages.length
            });
        }
    });
})

/* clears the store */
app.delete('/', (req, res) => {
    console.log("Deleting messages");
    messages = [];
    res.json({success: true });
})

/* makes the app listen on the selected port */
app.listen(httpPort, () => {
    console.log('Turtle and JSON-LD receiver ready on port '+httpPort);
})