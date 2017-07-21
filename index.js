/* we'll write proper js code */
"use strict";

const httpPort = 8080;

// Load a LRU cache implementation
const LRUcache = require('lru-cache-js')
// Load the web framework
const express = require('express');
// Load the logger for the web framework
const logger = require('morgan');
// Load some parsers for HTTP message bodys
const bodyParser = require('body-parser');
// Load RDF
const rdf = require('rdf-ext')
// Load the RDF parsers for HTTP messages
const rdfBodyParser = require('rdf-body-parser');
const RdfXmlSerializer = require('rdf-serializer-rdfxml');

// The root app
const app = express();

// Preparing to use my rdf/xml serialiser
const formatparams = {};
formatparams.serializers = new rdf.Serializers();
formatparams.serializers['application/rdf+xml'] = RdfXmlSerializer;
// Registering the serialiser with the common serialisers/parsers
const formats = require('rdf-formats-common')(formatparams);

// Configuring a body parser to using Turtle as default media type, and registering the formats
const configuredBodyParser = rdfBodyParser({'defaultMediaType' : 'text/turtle', 'formats' : formats});

// Registering the body parser with the app
app.use(configuredBodyParser);


function NamespaceManager(rdftermcache) {
  this.termcache = rdftermcache;
  this.ns = {};
};
NamespaceManager.prototype.createNamespace = function(prefix, IRI) {
  const that = this;
  this.ns[prefix] = function(localname) {
    return that.termcache.getIRI(IRI + localname);
  };
};

function RdfTermCache(overallsize) {
  // defaulting if nothing or rubbish is supplied:
  if (typeof overallsize !== "number")
    overallsize = 48;

  var individualsize = Math.floor(overallsize / 3);
  this.iris = new LRUcache(individualsize);
  this.bnodes = new LRUcache(individualsize);
  this.literals = new LRUcache(individualsize);
};
RdfTermCache.prototype.getIRI = function(string) {
  var iri = this.iris.get(string);
  if (iri === null) {
    iri = new rdf.NamedNode(string)
    this.iris.put(string, iri);
  }
  return iri;
};
RdfTermCache.prototype.getBlankNode = function(string) {
  var bnode = this.bnodes.get(string);
  if (bnode === null) {
    bnode = new rdf.BlankNode(string);
    this.bnodes.put(string, bnode);
  }
  return bnode;
};
RdfTermCache.prototype.getLiteral = function(lexicalValue, language, datatype, native) {
  // Double quotes because they do not appear un-escaped in literals
  var key = lexicalValue + '"' + language + '"' + datatype + '"' + native;
  var literal = this.literals.get(key);
  if (literal === null) {
    literal = new rdf.Literal(lexicalValue, language, datatype, native);
    this.literals.put(key, literal);
  }
  return literal;
};

const cache = new RdfTermCache(50);
const nsm = new NamespaceManager(cache);
nsm.createNamespace('rdf', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#');
nsm.createNamespace('ldp', 'http://www.w3.org/ns/ldp#');

// Where the data will be stored
let collection = {};
// Increment for POST requests
let nextCollectionIdxToCheck = 0;

const rootGraph = rdf.createGraph();
rootGraph.addAll(
  [
    new rdf.Triple(
      cache.getIRI(''),
      nsm.ns.rdf('type'),
      nsm.ns.ldp('BasicContainer'))
  ]
);

/**
 * GET root
 */
app.get('/', (req, res) => {
  const contentGraph = [];
  Object.keys(collection).forEach((o) => {
    contentGraph.push(
      new rdf.Triple(
        cache.getIRI(''),
        nsm.ns.ldp('contains'),
        cache.getIRI(o.toString())
      )
    );
  });
  res.sendGraph(rootGraph.merge(contentGraph));
});

/**
 * GET entry of collection
 */
app.get('/:id', (req, res) => {
  const collectionKeys = Object.keys(collection);
  if (! req.params.id in collectionKeys) {
    res.sendStatus(404);
    return;
  } else {
    res.status(200).send(collection[req.params.id].toString());
  }
});

/**
 * POST something to collection
 */
app.post('/', (request, response) => {
  if (!request.graph) {
    response.status(400);
    response.send("Please supply a parseable graph.");
    return;
  }
  do {
  ++nextCollectionIdxToCheck;
  } while (nextCollectionIdxToCheck - 1 in collection);
  
  collection[nextCollectionIdxToCheck - 1] = request.graph;
  response.location(nextCollectionIdxToCheck - 1);
  response.sendStatus(201);
});

/**
 * PUT something to collection
 */
app.post('/:id', (request, response) => {
  if (!request.graph) {
    response.status(400);
    response.send("Please supply a parseable graph.");
    return;
  }

  let overwriting = false;
  if (request.params.id in collection)
    overwriting = true;

  collection[request.params.id] = request.graph;

  if (overwriting)
    response.sendStatus(200);
  else
    response.sendStatus(201);
});

/**
 * DELETE one thing in the collection 
 */
app.delete('/:id', (request, response) => {
  if (request.params.id in collection) {
    delete collection[request.params.id];
    response.sendStatus(204);
  } else 
    response.sendStatus(404);
});

/**
 * DELETE everything in the collection 
 */
app.delete('/', (req, res) => {
  collection = {};
  res.sendStatus(204);
});


/**
 * makes the app listen on the selected port
 */
app.listen(httpPort, () => {
    console.log('Server ready on port ' + httpPort);
});

